import json
import shutil
import sys
from pathlib import Path

import pytest
import yaml

from kickstarter_ingest.cli import main
from kickstarter_ingest.loader import load_project
from kickstarter_ingest.mock import new_site_id, update_project_yaml

ROOT = Path(__file__).resolve().parents[2]

# firebase CLI の代わり。呼ばれた引数と、デプロイ時の firebase.json・公開するファイルを記録する
FAKE = """
import json, os, sys
from pathlib import Path
log = Path(os.environ["FAKE_LOG"])
calls = json.loads(log.read_text()) if log.exists() else []
call = {"args": sys.argv[1:]}
if sys.argv[1] == "deploy":
    call["config"] = json.loads(Path("firebase.json").read_text())
    call["files"] = sorted(p.name for p in Path("public").iterdir())
calls.append(call)
log.write_text(json.dumps(calls))
sys.exit(int(os.environ.get("FAKE_EXIT", "0")))
"""


@pytest.fixture
def env(tmp_path, monkeypatch):
    fake = tmp_path / "fake_firebase.py"
    fake.write_text(FAKE)
    monkeypatch.setenv("KICKSTARTER_FIREBASE", f"{sys.executable} {fake}")
    monkeypatch.setenv("FAKE_LOG", str(tmp_path / "calls.json"))
    monkeypatch.setenv("KICKSTARTER_CREDENTIALS", str(tmp_path / "none.json"))
    project = tmp_path / "sample"
    shutil.copytree(ROOT / "projects" / "sample", project)
    build = tmp_path / "dist"
    build.mkdir()
    (build / "index.html").write_text("<h1>mock</h1>")
    return project, build, tmp_path / "calls.json"


def test_mock_creates_site_once_and_adds_link(env):
    project, build, log = env
    assert main(["mock", str(project), str(build), "--gcp-project", "pj", "--note", "予約の流れ"]) == 0
    calls = json.loads(log.read_text())
    assert [c["args"][0] for c in calls] == ["hosting:sites:create", "deploy"]
    site = calls[0]["args"][1]
    assert site.startswith("ks-mock-sample-") and len(site) <= 30
    deploy = calls[1]
    assert deploy["args"][-3:] == ["--project", "pj", "--non-interactive"]
    assert deploy["config"]["hosting"]["site"] == site
    assert deploy["config"]["hosting"]["headers"][0]["headers"][0]["value"].startswith("noindex")
    assert deploy["files"] == ["index.html"]

    result = load_project(project)
    assert result.errors == []
    assert result.meta.mock_site == site
    link = result.meta.links[0]
    assert (link.title, link.url, link.note) == ("画面モック", f"https://{site}.web.app/", "予約の流れ")
    # サイト名はサイトに送らない
    assert "mock_site" not in result.meta.model_dump(exclude=result.meta.SITE_EXCLUDE)

    # 2 回目は同じサイトに上書きし、リンクを重ねない
    before = (project / "project.yaml").read_text(encoding="utf-8")
    assert main(["mock", str(project), str(build), "--gcp-project", "pj"]) == 0
    calls = json.loads(log.read_text())
    assert [c["args"][0] for c in calls[2:]] == ["deploy"]
    assert (project / "project.yaml").read_text(encoding="utf-8") == before


def test_update_template_with_empty_links():
    text = (ROOT / "templates" / "project.yaml").read_text(encoding="utf-8")
    out = update_project_yaml(text, "ks-mock-x-abcdefgh", "画面モック: 試作", "")
    data = yaml.safe_load(out)
    assert data["links"] == [{"title": "画面モック: 試作", "url": "https://ks-mock-x-abcdefgh.web.app/"}]
    assert data["mock_site"] == "ks-mock-x-abcdefgh"
    assert out.index("mock_site:") < out.index("forbidden_terms:")


def test_site_id_fits_hosting_rules():
    site = new_site_id("a-very-long-project-identifier-name")
    assert len(site) <= 30 and "--" not in site


def test_mock_errors(env, monkeypatch):
    project, build, _ = env
    (build / "index.html").unlink()
    assert main(["mock", str(project), str(build), "--gcp-project", "pj"]) == 1
    (build / "index.html").write_text("<h1>mock</h1>")
    # ログインもしておらず --gcp-project もない
    assert main(["mock", str(project), str(build)]) == 1
    monkeypatch.setenv("FAKE_EXIT", "1")
    assert main(["mock", str(project), str(build), "--gcp-project", "pj"]) == 1
    assert load_project(project).meta.mock_site == ""
