import shutil
from pathlib import Path

from kickstarter_ingest.cli import main
from kickstarter_ingest.doctypes import DOC_TYPES
from kickstarter_ingest.loader import load_project

ROOT = Path(__file__).resolve().parents[2]


def copy_sample(tmp_path: Path) -> Path:
    dest = tmp_path / "sample"
    shutil.copytree(ROOT / "projects" / "sample", dest)
    return dest


def test_sample_project_is_valid():
    result = load_project(ROOT / "projects" / "sample")
    assert result.errors == []
    assert len(result.docs) == 14


def test_templates_cover_all_doc_types():
    names = {p.name for p in (ROOT / "templates").iterdir()}
    assert {dt.filename for dt in DOC_TYPES} | {"project.yaml"} == names


def test_missing_doc_is_skipped(tmp_path):
    path = copy_sample(tmp_path)
    (path / "adr.md").unlink()
    result = load_project(path)
    assert result.errors == []
    assert result.missing == ["adr.md"]


def test_invalid_risk_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "risks.yaml").read_text(encoding="utf-8").replace("probability: 中", "probability: 大")
    (path / "risks.yaml").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("risks.yaml") for e in result.errors)


def test_id_must_match_directory(tmp_path):
    path = copy_sample(tmp_path)
    path.rename(tmp_path / "other")
    result = load_project(tmp_path / "other")
    assert any("ディレクトリ名" in e for e in result.errors)


def test_markdown_requires_title(tmp_path):
    path = copy_sample(tmp_path)
    (path / "requirements.md").write_text("# 見出しだけ\n", encoding="utf-8")
    assert main(["validate", str(path)]) == 1


def test_members_is_optional(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "project.yaml").read_text(encoding="utf-8")
    (path / "project.yaml").write_text(text.split("members:")[0], encoding="utf-8")
    result = load_project(path)
    assert result.errors == []
    assert result.meta.members == []
