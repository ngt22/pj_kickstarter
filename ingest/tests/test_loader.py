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


def test_invalid_gantt_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "roadmap.md").read_text(encoding="utf-8").replace("after: slot,", "after: nothing,")
    (path / "roadmap.md").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("roadmap.md: gantt") and "nothing" in e for e in result.errors)


def test_templates_are_valid(tmp_path):
    dest = tmp_path / "sample"
    shutil.copytree(ROOT / "templates", dest)
    result = load_project(dest)
    # project.yaml は id がディレクトリ名と一致しないので除く
    assert [e for e in result.errors if not e.startswith("project.yaml")] == []


def test_unknown_mock_element_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "screens.md").read_text(encoding="utf-8").replace("- checkbox:", "- chekbox:")
    (path / "screens.md").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("screens.md: mock") and "chekbox" in e for e in result.errors)


def test_mock_elements_match_web():
    import re

    from kickstarter_ingest.models import MOCK_ELEMENTS

    src = (ROOT / "web" / "src" / "components" / "ScreenMock.tsx").read_text(encoding="utf-8")
    body = src.split("const ELEMENTS", 1)[1].split("\n};", 1)[0]
    assert set(re.findall(r"^  (\w+): \(", body, re.M)) == set(MOCK_ELEMENTS)
