import base64
import json
import stat
from pathlib import Path

import pytest

from kickstarter_ingest import remote
from kickstarter_ingest.cli import main
from kickstarter_ingest.loader import load_project
from kickstarter_ingest.remote import Credentials, build_writes

ROOT = Path(__file__).resolve().parents[2]
DB = "projects/p/databases/(default)"


def fake_token(**claims) -> str:
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{enc({'alg': 'none'})}.{enc(claims)}."


def test_build_writes_for_new_project():
    result = load_project(ROOT / "projects" / "sample")
    writes = build_writes(result, DB, is_new=True, existing_docs={"requirements", "old-doc"})
    names = [w.get("update", {}).get("name") or w["delete"] for w in writes]
    root = f"{DB}/documents"
    assert names[0] == f"{root}/projects/sample"
    # 閲覧者は案件ドキュメントに載せず、access に追記する
    assert "members" not in writes[0]["update"]["fields"]
    access = writes[1]
    assert access["update"]["name"] == f"{root}/access/you@example.com"
    assert access["updateMask"] == {"fieldPaths": []}
    assert access["updateTransforms"][0]["appendMissingElements"]["values"] == [{"stringValue": "sample"}]
    req = next(w for w in writes if w.get("update", {}).get("name", "").endswith("/docs/requirements"))
    assert req["update"]["fields"]["order"] == {"integerValue": "2"}
    assert req["updateTransforms"] == [{"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"}]
    # 原稿にないドキュメントだけ消す
    assert [w["delete"] for w in writes if "delete" in w] == [f"{root}/projects/sample/docs/old-doc"]


def test_build_writes_keeps_access_for_existing_project():
    result = load_project(ROOT / "projects" / "sample")
    writes = build_writes(result, DB, is_new=False, existing_docs=set())
    assert not any("/access/" in w.get("update", {}).get("name", "") for w in writes)


def test_check_admin():
    assert remote.check_admin(fake_token(email="a@x.com", email_verified=True, admin=True))["email"] == "a@x.com"
    with pytest.raises(remote.RemoteError, match="管理者ではありません"):
        remote.check_admin(fake_token(email="a@x.com", email_verified=True))
    with pytest.raises(remote.RemoteError, match="確認されていません"):
        remote.check_admin(fake_token(email="a@x.com", email_verified=False, admin=True))


def test_credentials_are_private(tmp_path, monkeypatch):
    monkeypatch.setenv("KICKSTARTER_CREDENTIALS", str(tmp_path / "c" / "credentials.json"))
    path = remote.save_credentials(Credentials("https://x.web.app", "key", "p", "refresh", "a@x.com"))
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert remote.load_credentials().refresh_token == "refresh"
    assert main(["whoami"]) == 0
    assert main(["logout"]) == 0
    assert remote.load_credentials() is None


def test_urls():
    prod = Credentials("https://x.web.app", "key", "p", "r")
    assert prod.auth_url("securetoken.googleapis.com", "token") == "https://securetoken.googleapis.com/v1/token?key=key"
    assert prod.firestore_url(":commit") == "https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents:commit"
    emu = Credentials("emulator", "demo-key", "demo-kickstarter", "r")
    assert emu.auth_url("identitytoolkit.googleapis.com", "accounts:signInWithPassword").startswith(
        "http://localhost:9099/identitytoolkit.googleapis.com/v1/"
    )
    assert emu.firestore_url().startswith("http://localhost:8080/v1/projects/demo-kickstarter/")
