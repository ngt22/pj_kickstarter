"""管理者のアカウントで Firestore に書き込む（REST API）。

サービスアカウントの鍵を使わず、管理者が自分でログインしたトークンで書くので、Firestore のルールがそのまま効く。
管理者でないアカウントでは書き込みがルールで拒否される。
"""

import base64
import json
import os
import stat
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import requests

from .loader import LoadResult
from .models import ProjectMeta

TIMEOUT = 30
EMULATOR_AUTH = "localhost:9099"
EMULATOR_FIRESTORE = "localhost:8080"


class RemoteError(Exception):
    pass


@dataclass
class Credentials:
    site: str  # ログインしたサイトの URL。エミュレータなら "emulator"
    api_key: str
    project_id: str
    refresh_token: str
    email: str = ""

    @property
    def emulator(self) -> bool:
        return self.site == "emulator"

    def auth_url(self, service: str, path: str) -> str:
        base = f"http://{EMULATOR_AUTH}/{service}" if self.emulator else f"https://{service}"
        return f"{base}/v1/{path}?key={self.api_key}"

    def firestore_url(self, path: str = "") -> str:
        base = f"http://{EMULATOR_FIRESTORE}" if self.emulator else "https://firestore.googleapis.com"
        return f"{base}/v1/{self.database}/documents{path}"

    @property
    def database(self) -> str:
        return f"projects/{self.project_id}/databases/(default)"


def credentials_path() -> Path:
    if os.environ.get("KICKSTARTER_CREDENTIALS"):
        return Path(os.environ["KICKSTARTER_CREDENTIALS"])
    base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return base / "kickstarter-ingest" / "credentials.json"


def save_credentials(creds: Credentials) -> Path:
    path = credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # トークンは管理者の権限そのものなので、本人以外が読めないようにしてから書く
    path.touch(mode=stat.S_IRUSR | stat.S_IWUSR, exist_ok=True)
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    path.write_text(json.dumps(asdict(creds), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_credentials() -> Credentials | None:
    path = credentials_path()
    if not path.exists():
        return None
    return Credentials(**json.loads(path.read_text(encoding="utf-8")))


def delete_credentials() -> bool:
    path = credentials_path()
    if not path.exists():
        return False
    path.unlink()
    return True


def _post(url: str, payload: dict[str, Any], headers: dict[str, str] | None = None) -> dict[str, Any]:
    res = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    if not res.ok:
        raise RemoteError(_error_message(res))
    return res.json()


def _error_message(res: requests.Response) -> str:
    try:
        err = res.json().get("error", {})
        message = err.get("message", "") if isinstance(err, dict) else str(err)
    except ValueError:
        message = res.text[:200]
    if res.status_code in (401, 403):
        return f"書き込みが拒否されました（{message}）。管理者のアカウントでログインしているか確認し、login し直してください"
    return f"HTTP {res.status_code}: {message}"


def site_config(site: str) -> tuple[str, str]:
    """サイトが公開している cli-config.json から、Web API キーとプロジェクトIDを得る。"""
    url = site.rstrip("/") + "/cli-config.json"
    try:
        res = requests.get(url, timeout=TIMEOUT)
        res.raise_for_status()
        config = res.json()
        return config["apiKey"], config["projectId"]
    except (requests.RequestException, ValueError, KeyError) as e:
        raise RemoteError(f"{url} を読めませんでした（{e}）。サイトの URL を確認してください") from e


def token_claims(id_token: str) -> dict[str, Any]:
    """ID トークンの中身を読む（表示と事前チェック用。検証はサーバーのルールが行う）。"""
    payload = id_token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


SIGN_IN_ERRORS = {
    "EMAIL_NOT_FOUND": "このメールアドレスのユーザーがいません。先にサイトでサインアップしてください"
    "（エミュレータなら pnpm emu:user で作成。エミュレータを再起動するとユーザーは消えます）",
    "INVALID_PASSWORD": "パスワードが違います",
    "INVALID_LOGIN_CREDENTIALS": "メールアドレスかパスワードが違います",
    "USER_DISABLED": "このユーザーは無効にされています",
}


def sign_in_with_password(creds: Credentials, email: str, password: str) -> Credentials:
    try:
        data = _post(
            creds.auth_url("identitytoolkit.googleapis.com", "accounts:signInWithPassword"),
            {"email": email, "password": password, "returnSecureToken": True},
        )
    except RemoteError as e:
        hint = next((v for k, v in SIGN_IN_ERRORS.items() if k in str(e)), None)
        raise RemoteError(f"{hint}（{e}）" if hint else str(e)) from e
    creds.refresh_token = data["refreshToken"]
    return creds


def id_token(creds: Credentials) -> str:
    """保存してあるリフレッシュトークンから、1時間有効な ID トークンを取る。"""
    try:
        data = _post(
            creds.auth_url("securetoken.googleapis.com", "token"),
            {"grant_type": "refresh_token", "refresh_token": creds.refresh_token},
        )
    except RemoteError as e:
        raise RemoteError(f"ログインの有効期限が切れたか、無効です（{e}）。login し直してください") from e
    return data["id_token"]


def check_admin(token: str) -> dict[str, Any]:
    claims = token_claims(token)
    if not claims.get("email_verified"):
        raise RemoteError(f"{claims.get('email')} はメールアドレスが確認されていません")
    if claims.get("admin") is not True:
        raise RemoteError(
            f"{claims.get('email')} は管理者ではありません。"
            "`kickstarter-ingest admin grant` で管理者にしてから、サイトにログインし直してください"
        )
    return claims


# --- Firestore REST ---


def _value(v: Any) -> dict[str, Any]:
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, bytes):
        return {"bytesValue": base64.b64encode(v).decode()}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: _value(x) for k, x in v.items()}}}
    raise TypeError(f"Firestore に書けない値です: {v!r}")


def _set(name: str, data: dict[str, Any]) -> dict[str, Any]:
    """ドキュメントを丸ごと置き換え、updatedAt をサーバーの時刻にする。"""
    return {
        "update": {"name": name, "fields": {k: _value(v) for k, v in data.items()}},
        "updateTransforms": [{"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"}],
    }


def build_writes(result: LoadResult, database: str, is_new: bool, existing_docs: set[str]) -> list[dict[str, Any]]:
    """push と同じ内容の書き込みを、Firestore REST の commit 形式で作る（firestore.push と揃える）。"""
    assert result.meta is not None
    root = f"{database}/documents"
    project = f"{root}/projects/{result.meta.id}"
    meta = result.meta.model_dump(exclude=ProjectMeta.SITE_EXCLUDE)
    writes = [_set(project, {**meta, "files": [f.record() for f in result.files]})]
    # members は新規案件の初期値としてだけ使う。以降は管理画面で外した人を push で戻さないよう、触らない
    for email in result.meta.members if is_new else []:
        writes.append(
            {
                "update": {"name": f"{root}/access/{email}", "fields": {}},
                "updateMask": {"fieldPaths": []},
                "updateTransforms": [
                    {"fieldPath": "projects", "appendMissingElements": {"values": [_value(result.meta.id)]}},
                    {"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"},
                ],
            }
        )
    keep = set()
    for doc in result.docs:
        keep.add(doc.type)
        writes.append(
            _set(
                f"{project}/docs/{doc.type}",
                {"type": doc.type, "title": doc.title, "order": doc.order, "format": doc.format, "body": doc.body},
            )
        )
    # 原稿から消したドキュメントは Firestore からも消す
    writes.extend({"delete": f"{project}/docs/{t}"} for t in sorted(existing_docs - keep))
    return writes


# 1 回の commit で送るファイルの断片の数（REST では base64 で 1.3 倍になる。1 リクエストは 10MiB まで）
BLOBS_PER_COMMIT = 4


def blob_commits(result: LoadResult, database: str, existing: set[str]) -> list[list[dict[str, Any]]]:
    """まだサイトにないファイルの断片（blobs）を書く commit の一覧。中身のハッシュが ID なので、変わっていなければ送らない。"""
    assert result.meta is not None
    root = f"{database}/documents/projects/{result.meta.id}/blobs"
    writes = [
        {"update": {"name": f"{root}/{blob_id}", "fields": {k: _value(v) for k, v in {"file": f.id, "index": i, "data": chunk}.items()}}}
        for f in result.files
        for i, (blob_id, chunk) in enumerate(zip(f.blob_ids(), f.chunks()))
        if blob_id not in existing
    ]
    return [writes[i : i + BLOBS_PER_COMMIT] for i in range(0, len(writes), BLOBS_PER_COMMIT)]


def stale_blob_deletes(result: LoadResult, database: str, existing: set[str]) -> list[dict[str, Any]]:
    """原稿から外したファイルの断片を消す書き込み。"""
    assert result.meta is not None
    keep = {b for f in result.files for b in f.blob_ids()}
    root = f"{database}/documents/projects/{result.meta.id}/blobs"
    return [{"delete": f"{root}/{b}"} for b in sorted(existing - keep)]


def _list_ids(creds: Credentials, path: str, headers: dict[str, str], field: str) -> set[str]:
    ids: set[str] = set()
    page_token = ""
    while True:
        params = {"pageSize": 300, "mask.fieldPaths": field, **({"pageToken": page_token} if page_token else {})}
        res = requests.get(creds.firestore_url(path), headers=headers, params=params, timeout=TIMEOUT)
        if not res.ok:
            raise RemoteError(_error_message(res))
        body = res.json()
        ids |= {d["name"].rsplit("/", 1)[1] for d in body.get("documents", [])}
        page_token = body.get("nextPageToken", "")
        if not page_token:
            return ids


def forbidden_terms(creds: Credentials) -> list[str]:
    """管理画面で設定したサイト共通の禁止語（settings/private）。未設定なら空。"""
    token = id_token(creds)
    check_admin(token)
    res = requests.get(
        creds.firestore_url("/settings/private"), headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT
    )
    if res.status_code == 404:
        return []
    if not res.ok:
        raise RemoteError(_error_message(res))
    values = res.json().get("fields", {}).get("forbidden_terms", {}).get("arrayValue", {}).get("values", [])
    return [v["stringValue"] for v in values if "stringValue" in v]


def push(result: LoadResult, creds: Credentials) -> int:
    assert result.meta is not None
    token = id_token(creds)
    check_admin(token)
    headers = {"Authorization": f"Bearer {token}"}
    project_path = f"/projects/{result.meta.id}"

    res = requests.get(creds.firestore_url(project_path), headers=headers, timeout=TIMEOUT)
    if res.status_code not in (200, 404):
        raise RemoteError(_error_message(res))
    is_new = res.status_code == 404

    existing = _list_ids(creds, project_path + "/docs", headers, "type")
    existing_blobs = _list_ids(creds, project_path + "/blobs", headers, "file")

    url = creds.firestore_url(":commit")
    # ファイルの中身を先に置き、案件ドキュメントが参照したときには読めるようにする
    for writes in blob_commits(result, creds.database, existing_blobs):
        _post(url, {"writes": writes}, headers)
    _post(url, {"writes": build_writes(result, creds.database, is_new, existing)}, headers)
    stale = stale_blob_deletes(result, creds.database, existing_blobs)
    for i in range(0, len(stale), 500):
        _post(url, {"writes": stale[i : i + 500]}, headers)
    return len(result.docs)
