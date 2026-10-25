import shutil
from pathlib import Path

from kickstarter_ingest.cli import main
from kickstarter_ingest.loader import load_project
from kickstarter_ingest.wording import check_wording

ROOT = Path(__file__).resolve().parents[2]


def copy_sample(tmp_path: Path) -> Path:
    dest = tmp_path / "sample"
    shutil.copytree(ROOT / "projects" / "sample", dest)
    return dest


def append(path: Path, text: str) -> None:
    path.write_text(path.read_text(encoding="utf-8") + text, encoding="utf-8")


def test_sample_has_no_findings():
    report = check_wording(load_project(ROOT / "projects" / "sample"))
    assert report.findings == []
    assert report.undecided == 0


def test_forbidden_terms_block(tmp_path):
    path = copy_sample(tmp_path)
    append(path / "project.yaml", "forbidden_terms: [ノブ]\n")
    append(path / "requirements.md", "\n担当：ノブ\n")
    report = check_wording(load_project(path), ["社内コード"])
    # project.yaml の禁止語の一覧そのものは引っかからない
    assert [(f.file, f.term) for f in report.blocking] == [("requirements.md", "ノブ")]

    append(path / "glossary.yaml", "# 社内コード はコメントなので対象外\n")
    append(path / "roadmap.md", "\n<!-- 社内コード -->\n本文の社内コード\n")
    report = check_wording(load_project(path), ["社内コード"])
    assert [(f.file, f.term) for f in report.blocking if f.term == "社内コード"] == [("roadmap.md", "社内コード")]
    assert report.blocking[-1].line == (path / "roadmap.md").read_text(encoding="utf-8").count("\n")


def test_placeholder_blocks_and_caution_warns(tmp_path):
    path = copy_sample(tmp_path)
    append(path / "requirements.md", "\n〇〇様向けの機能（TODO）。仕様は未定、画面も未定\n")
    report = check_wording(load_project(path))
    assert [f.term for f in report.blocking] == ["〇〇"]
    assert [f.term for f in report.warnings] == ["TODO"]
    assert report.undecided == 2


def test_validate_reports_but_does_not_fail(tmp_path, capsys):
    path = copy_sample(tmp_path)
    append(path / "requirements.md", "\n〇〇様\n")
    assert main(["validate", str(path)]) == 0
    assert "requirements.md" in capsys.readouterr().err


def test_private_fields_are_not_pushed():
    from kickstarter_ingest.remote import build_writes

    result = load_project(ROOT / "projects" / "sample")
    result.meta.forbidden_terms = ["ノブ"]
    writes = build_writes(result, "projects/p/databases/(default)", is_new=False, existing_docs=set())
    assert "forbidden_terms" not in writes[0]["update"]["fields"]
    assert "members" not in writes[0]["update"]["fields"]
