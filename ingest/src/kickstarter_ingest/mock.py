"""画面モック（静的なビルド結果）を、案件ごとの Firebase Hosting サイトにデプロイする。

Hosting は Spark プランでアクセス制限をかけられないため、URL を知っていれば誰でも開ける。
推測されにくいサイト名（ks-mock-<案件ID>-<ランダム>）にして、検索よけ（X-Robots-Tag: noindex）を付ける。
本体サイトとは別のサイトなので、本体やほかの案件のモックを巻き込まずに更新できる。
デプロイには利用者の端末の firebase CLI（firebase login 済み）を使う。
"""

import json
import os
import re
import secrets
import shlex
import shutil
import string
import subprocess
import tempfile
from pathlib import Path

MOCK_TITLE = "画面モック"


class MockError(Exception):
    pass


def new_site_id(project_id: str) -> str:
    """Hosting のサイト名（30 文字まで、英小文字・数字・ハイフン）。末尾をランダムにして推測されにくくする。"""
    suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    return f"ks-mock-{project_id[:12].strip('-')}-{suffix}"


def site_url(site: str) -> str:
    return f"https://{site}.web.app/"


def hosting_config(site: str) -> dict:
    return {
        "hosting": {
            "site": site,
            "public": "public",
            # 1 ページで画面を切り替えるモック（SPA）でも、直接開いた URL が 404 にならないようにする
            "rewrites": [{"source": "**", "destination": "/index.html"}],
            "headers": [{"source": "**", "headers": [{"key": "X-Robots-Tag", "value": "noindex, nofollow"}]}],
        }
    }


def firebase_cmd() -> list[str]:
    """firebase CLI のコマンド。PATH になければ KICKSTARTER_FIREBASE（例: "pnpm --dir web exec firebase"）で指定する。"""
    if os.environ.get("KICKSTARTER_FIREBASE"):
        return shlex.split(os.environ["KICKSTARTER_FIREBASE"])
    if shutil.which("firebase"):
        return ["firebase"]
    raise MockError(
        "firebase CLI が見つかりません。`npm i -g firebase-tools` でインストールして `firebase login` するか、"
        '環境変数 KICKSTARTER_FIREBASE にコマンドを指定してください（例: "pnpm --dir web exec firebase"）'
    )


def _run(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([*firebase_cmd(), *args], cwd=cwd, capture_output=True, text=True)


def create_site(site: str, gcp_project: str) -> None:
    res = _run(["hosting:sites:create", site, "--project", gcp_project, "--non-interactive"])
    if res.returncode != 0:
        raise MockError(f"Hosting のサイト {site} を作れませんでした:\n{(res.stderr or res.stdout).strip()}")


def deploy(build_dir: Path, site: str, gcp_project: str) -> None:
    """build_dir の中身を、作業用のディレクトリに firebase.json と一緒にコピーしてデプロイする。"""
    with tempfile.TemporaryDirectory(prefix="ks-mock-") as tmp:
        work = Path(tmp)
        shutil.copytree(build_dir, work / "public")
        (work / "firebase.json").write_text(json.dumps(hosting_config(site), indent=2), encoding="utf-8")
        res = _run(["deploy", "--only", "hosting", "--project", gcp_project, "--non-interactive"], cwd=work)
        if res.returncode != 0:
            raise MockError(f"デプロイに失敗しました:\n{(res.stderr or res.stdout).strip()}")


def _quote(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def update_project_yaml(text: str, site: str, title: str, note: str) -> str:
    """project.yaml の原文に mock_site と links のリンクを書き足す（コメントや並びを崩さないよう、行で編集する）。"""
    if re.search(r"^mock_site:", text, re.M):
        text = re.sub(r"^mock_site:.*$", f"mock_site: {site}", text, count=1, flags=re.M)
    else:
        line = f"# 画面モックをデプロイした Hosting のサイト名（kickstarter-ingest mock が書く。サイトには送らない）\nmock_site: {site}\n"
        text = text if text.endswith("\n") else text + "\n"
        m = re.search(r"^(# [^\n]*\n)*forbidden_terms:", text, re.M)
        text = text[: m.start()] + line + text[m.start() :] if m else text + line

    url = site_url(site)
    if url in text:
        return text
    item = f"  - title: {_quote(title)}\n    url: {url}\n" + (f"    note: {_quote(note)}\n" if note else "")
    if re.search(r"^links:\s*\[\]\s*$", text, re.M):
        return re.sub(r"^links:\s*\[\]\s*$\n?", lambda _: "links:\n" + item, text, count=1, flags=re.M)
    if re.search(r"^links:\s*$", text, re.M):
        return re.sub(r"^links:\s*$\n?", lambda _: "links:\n" + item, text, count=1, flags=re.M)
    return text + "links:\n" + item


def mock_deploy(project_dir: Path, build_dir: Path, gcp_project: str, title: str = MOCK_TITLE, note: str = "") -> str:
    """モックをデプロイし、project.yaml を更新して URL を返す。サイトは初回だけ作り、以降は同じサイトに上書きする。"""
    from .loader import load_project

    if not (build_dir / "index.html").is_file():
        raise MockError(f"{build_dir} に index.html がありません。モックのビルド結果（dist など）を指定してください")
    result = load_project(project_dir)
    if result.meta is None:
        raise MockError("project.yaml を読めません。先に validate のエラーを直してください")
    site = result.meta.mock_site
    if not site:
        site = new_site_id(result.meta.id)
        create_site(site, gcp_project)
    deploy(build_dir, site, gcp_project)

    meta = project_dir / "project.yaml"
    meta.write_text(update_project_yaml(meta.read_text(encoding="utf-8"), site, title, note), encoding="utf-8")
    return site_url(site)
