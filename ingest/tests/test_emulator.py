"""login したアカウントでの push を、Auth / Firestore エミュレータで通しで確かめる。

  cd web && pnpm exec firebase emulators:exec --only auth,firestore --project demo-kickstarter \\
    "cd ../ingest && uv run pytest tests/test_emulator.py"
"""

import os
import uuid
from pathlib import Path

import pytest
import requests

from kickstarter_ingest import remote
from kickstarter_ingest.cli import main
from kickstarter_ingest.loader import load_project

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST"), reason="エミュレータの中で実行したときだけ動かす"
)

ROOT = Path(__file__).resolve().parents[2]
AUTH = f"http://{remote.EMULATOR_AUTH}/identitytoolkit.googleapis.com/v1"
OWNER = {"authorization": "Bearer owner"}  # エミュレータ専用の管理者トークン


def create_user(admin: bool) -> str:
    email = f"{uuid.uuid4().hex[:8]}@example.com"
    res = requests.post(f"{AUTH}/accounts:signUp?key=demo-key", json={"email": email, "password": "password123"})
    update = {"localId": res.json()["localId"], "emailVerified": True}
    if admin:
        update["customAttributes"] = '{"admin": true}'
    requests.post(f"{AUTH}/projects/demo-kickstarter/accounts:update", json=update, headers=OWNER).raise_for_status()
    return email


@pytest.fixture(autouse=True)
def credentials_file(tmp_path, monkeypatch):
    monkeypatch.setenv("KICKSTARTER_CREDENTIALS", str(tmp_path / "credentials.json"))
    monkeypatch.setenv("KICKSTARTER_PASSWORD", "password123")


def firestore_get(path: str) -> requests.Response:
    return requests.get(remote.Credentials("emulator", "", "demo-kickstarter", "").firestore_url(path), headers=OWNER)


def test_admin_can_push(tmp_path):
    email = create_user(admin=True)
    assert main(["login", "--emulator", "--email", email]) == 0
    assert remote.load_credentials().email == email

    assert main(["init", "e2e", "--parent", str(tmp_path)]) == 0
    project = tmp_path / "e2e"
    meta = project / "project.yaml"
    meta.write_text(meta.read_text(encoding="utf-8").replace("members: []", "members: [client@example.com]"), encoding="utf-8")
    assert main(["push", str(project)]) == 0

    doc = firestore_get("/projects/e2e/docs/requirements").json()
    assert doc["fields"]["title"]["stringValue"] == "要件定義書"
    assert "updatedAt" in doc["fields"]
    access = firestore_get("/access/client@example.com").json()
    assert access["fields"]["projects"]["arrayValue"]["values"] == [{"stringValue": "e2e"}]

    # 原稿から消したドキュメントは消える
    (project / "adr.md").unlink()
    assert main(["push", str(project)]) == 0
    assert firestore_get("/projects/e2e/docs/adr").status_code == 404


def test_pasted_token_works(monkeypatch):
    email = create_user(admin=True)
    creds = remote.sign_in_with_password(remote.Credentials("emulator", "demo-key", "demo-kickstarter", ""), email, "password123")
    monkeypatch.setattr("getpass.getpass", lambda prompt="": creds.refresh_token)
    assert main(["login", "--emulator"]) == 0
    assert remote.load_credentials().email == email


def test_non_admin_cannot_login_or_write():
    email = create_user(admin=False)
    assert main(["login", "--emulator", "--email", email]) == 1
    assert remote.load_credentials() is None

    # CLI の事前チェックを通らなくても、ルールが書き込みを拒否する
    creds = remote.sign_in_with_password(remote.Credentials("emulator", "demo-key", "demo-kickstarter", ""), email, "password123")
    result = load_project(ROOT / "projects" / "sample")
    writes = remote.build_writes(result, creds.database, is_new=False, existing_docs=set())
    res = requests.post(
        creds.firestore_url(":commit"),
        json={"writes": writes},
        headers={"Authorization": f"Bearer {remote.id_token(creds)}"},
    )
    assert res.status_code == 403
