import shutil
from pathlib import Path

import yaml

from kickstarter_ingest.cli import main
from kickstarter_ingest.doctypes import DOC_TYPES
from kickstarter_ingest.loader import load_project
from kickstarter_ingest.models import EstimateDoc

ROOT = Path(__file__).resolve().parents[2]


def copy_sample(tmp_path: Path) -> Path:
    dest = tmp_path / "sample"
    shutil.copytree(ROOT / "projects" / "sample", dest)
    return dest


def test_sample_project_is_valid():
    result = load_project(ROOT / "projects" / "sample")
    assert result.errors == []
    assert [d.type for d in result.docs] == [dt.key for dt in DOC_TYPES]
    assert [d.order for d in result.docs] == list(range(1, 18))


def test_old_order_in_front_matter_is_ignored(tmp_path):
    path = copy_sample(tmp_path)
    file = path / "personas.md"
    file.write_text(file.read_text(encoding="utf-8").replace("---\n", "---\norder: 2\n", 1), encoding="utf-8")
    result = load_project(path)
    assert result.errors == []
    assert next(d for d in result.docs if d.type == "personas").order == 3


def test_doc_order_and_parts_match_web():
    import re

    from kickstarter_ingest.doctypes import PARTS

    src = (ROOT / "web" / "src" / "lib" / "doctypes.ts").read_text(encoding="utf-8")
    parts = re.findall(r'\{ key: "(\w+)", title: "([^"]+)" \}', src.split("export const PARTS", 1)[1].split("] as const", 1)[0])
    assert parts == list(PARTS)
    body = src.split("export const DOC_PARTS", 1)[1].split("\n};", 1)[0]
    assert re.findall(r'^  "?([\w-]+)"?: "(\w+)",', body, re.MULTILINE) == [(dt.key, dt.part) for dt in DOC_TYPES]


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


def test_unknown_list_row_key_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "screens.md").read_text(encoding="utf-8").replace("badge: 確定, thumb: true", "badge: 確定, image: true", 1)
    (path / "screens.md").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any("list の行に書けない項目 ['image']" in e for e in result.errors)


def test_drawing_pins_are_checked(tmp_path):
    path = copy_sample(tmp_path)
    screens = path / "screens.md"
    text = screens.read_text(encoding="utf-8")
    drawing = "  - drawing: { rooms: [教室1, 教室2], pins: [{ x: 20, y: 30, status: new }], selected: 1 }\n"
    screens.write_text(text.replace("  - heading:", drawing + "  - heading:", 1), encoding="utf-8")
    assert load_project(path).errors == []

    screens.write_text(text.replace("  - heading:", drawing.replace("x: 20", "x: 120") + "  - heading:", 1), encoding="utf-8")
    assert any("0〜100" in e for e in load_project(path).errors)
    screens.write_text(text.replace("  - heading:", drawing.replace("status: new", "status: open") + "  - heading:", 1), encoding="utf-8")
    assert any("status は" in e for e in load_project(path).errors)


def test_mock_devices_are_checked(tmp_path):
    path = copy_sample(tmp_path)
    screens = path / "screens.md"
    text = screens.read_text(encoding="utf-8")
    assert "device: desktop\n" in text
    screens.write_text(text.replace("device: desktop\n", "device: tablet\ndevices: [desktop, tablet]\npwa: true\ndisplay: pwa\n", 1), encoding="utf-8")
    assert load_project(path).errors == []

    screens.write_text(text.replace("device: desktop\n", "device: tablet\ndevices: [desktop, mobile]\n", 1), encoding="utf-8")
    assert any("devices にありません" in e for e in load_project(path).errors)


def test_mock_elements_match_web():
    import re

    from kickstarter_ingest.models import MOCK_ELEMENTS

    src = (ROOT / "web" / "src" / "components" / "ScreenMock.tsx").read_text(encoding="utf-8")
    body = src.split("const ELEMENTS", 1)[1].split("\n};", 1)[0]
    assert set(re.findall(r"^  (\w+): \(", body, re.M)) == set(MOCK_ELEMENTS)


def test_broken_er_reference_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "er-diagram.md").read_text(encoding="utf-8").replace("fk: menu }", "fk: menus }")
    (path / "er-diagram.md").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("er-diagram.md: er") and "menus" in e for e in result.errors)


def test_members_is_optional(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "project.yaml").read_text(encoding="utf-8")
    (path / "project.yaml").write_text(text.split("members:")[0], encoding="utf-8")
    result = load_project(path)
    assert result.errors == []
    assert result.meta.members == []


def test_push_without_target_is_rejected(capsys, tmp_path, monkeypatch):
    import pytest

    with pytest.raises(SystemExit):
        main(["admin", "list"])
    assert "--gcp-project" in capsys.readouterr().err
    # push はログインしていなければ、login か --gcp-project を求める
    monkeypatch.setenv("KICKSTARTER_CREDENTIALS", str(tmp_path / "none.json"))
    assert main(["push", str(ROOT / "projects" / "sample")]) == 1
    err = capsys.readouterr().err
    assert "login" in err and "--gcp-project" in err


def test_cover_fields(tmp_path):
    result = load_project(ROOT / "projects" / "sample")
    assert result.meta.proposed_at == "2026-10-24"  # YAML の日付型は文字列にそろえる
    path = copy_sample(tmp_path)
    text = (path / "project.yaml").read_text(encoding="utf-8")
    text = text.replace("color: brand", "color: purple").replace("proposed_at: 2026-10-24", "proposed_at: 10/24")
    (path / "project.yaml").write_text(text, encoding="utf-8")
    errors = load_project(path).errors
    assert any("color" in e for e in errors)
    assert any("proposed_at" in e for e in errors)


LEGACY_ESTIMATE = """\
title: 見積もり
order: 10
unit_price: 800000
items:
  - { phase: 開発, task: 予約機能, person_months: 1.5 }
"""


def test_legacy_estimate_is_read_as_initial(tmp_path):
    path = copy_sample(tmp_path)
    (path / "estimate.yaml").write_text(LEGACY_ESTIMATE, encoding="utf-8")
    result = load_project(path)
    assert result.errors == []
    doc = EstimateDoc.model_validate(yaml.safe_load(LEGACY_ESTIMATE))
    assert doc.initial.unit_price == 800000
    assert doc.monthly is None


def test_monthly_includes_cannot_have_amounts(tmp_path):
    # 月額の内訳に金額（原価）を書けないようにする
    path = copy_sample(tmp_path)
    text = (path / "estimate.yaml").read_text(encoding="utf-8")
    text = text.replace("- サーバーの運用・監視", "- { name: クラウド利用料, amount: 10000 }")
    (path / "estimate.yaml").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("estimate.yaml") for e in result.errors)


def test_estimate_cannot_mix_legacy_and_initial(tmp_path):
    path = copy_sample(tmp_path)
    text = (path / "estimate.yaml").read_text(encoding="utf-8") + "items: []\n"
    (path / "estimate.yaml").write_text(text, encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("estimate.yaml") for e in result.errors)


def test_invalid_usecase_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    personas = path / "personas.md"
    text = personas.read_text(encoding="utf-8")
    personas.write_text(text.replace("actors: [staff] }", "actors: [nobody] }", 1), encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("personas.md: usecase") and "nobody" in e and "候補" in e for e in result.errors)

    personas.write_text(text.replace("to: UC-01, type: include", "to: UC-99, type: include"), encoding="utf-8")
    result = load_project(path)
    assert any("UC-99" in e for e in result.errors)

    personas.write_text(text.replace("zone: store, inherits: staff", "zone: shop, inherits: staff"), encoding="utf-8")
    result = load_project(path)
    assert any("zone: shop" in e and "候補" in e for e in result.errors)

    personas.write_text(text.replace("to: store, label", "to: customer, label"), encoding="utf-8")
    result = load_project(path)
    assert any("隣り合う区画" in e for e in result.errors)


def test_invalid_flow_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    flow = path / "page-flow.md"
    text = flow.read_text(encoding="utf-8")
    flow.write_text(text.replace("{ from: SC-10, to: SC-11", "{ from: SC-04, to: SC-11", 1), encoding="utf-8")
    result = load_project(path)
    assert any(e.startswith("page-flow.md: flow") and "同じ区画・レーン" in e for e in result.errors)

    flow.write_text(text.replace("lane: settings }", "lane: setting }", 1), encoding="utf-8")
    result = load_project(path)
    assert any("lane: setting" in e and "候補" in e for e in result.errors)


def test_screen_ids_are_cross_checked(tmp_path):
    path = copy_sample(tmp_path)
    assert load_project(path).warnings == []

    screens = path / "screens.md"
    text = screens.read_text(encoding="utf-8").replace("to: SC-10", "to: SC-99", 1)
    screens.write_text(text + "\n## SC-20 お知らせ\n", encoding="utf-8")
    warnings = load_project(path).warnings
    assert any("SC-20" in w and "ページ遷移図" in w for w in warnings)
    assert any("SC-99" in w for w in warnings)


def test_invalid_arch_is_reported(tmp_path):
    path = copy_sample(tmp_path)
    spec = path / "tech-spec.md"
    text = spec.read_text(encoding="utf-8")
    spec.write_text(text.replace("{ from: web, to: db,", "{ from: web, to: database,", 1), encoding="utf-8")
    assert any(e.startswith("tech-spec.md: arch") and "database" in e for e in load_project(path).errors)

    spec.write_text(text.replace("kind: function", "kind: lambda", 1), encoding="utf-8")
    assert any(e.startswith("tech-spec.md: arch") for e in load_project(path).errors)


def test_sample_materials_are_loaded():
    result = load_project(ROOT / "projects" / "sample")
    assert [l.title for l in result.meta.links][0] == "画面モック（Figma）"
    [f] = result.files
    assert (f.name, f.title, f.content_type) == ("service-overview.pdf", "サービス概要", "application/pdf")
    record = f.record()
    assert record["size"] == len(f.data) and record["chunks"] == 1
    assert "path" not in record


def test_large_file_is_split_into_chunks(tmp_path):
    from kickstarter_ingest.loader import CHUNK_BYTES

    path = copy_sample(tmp_path)
    (path / "attachments" / "big.bin").write_bytes(b"x" * (CHUNK_BYTES * 2 + 1))
    meta = yaml.safe_load((path / "project.yaml").read_text(encoding="utf-8"))
    meta["files"] = [{"path": "attachments/big.bin"}]
    (path / "project.yaml").write_text(yaml.safe_dump(meta, allow_unicode=True), encoding="utf-8")
    [f] = load_project(path).files
    assert f.title == "big" and len(f.chunks()) == 3
    assert b"".join(f.chunks()) == f.data
    assert f.blob_ids() == [f"{f.id}-0", f"{f.id}-1", f"{f.id}-2"]


def test_bad_materials_are_reported(tmp_path):
    from kickstarter_ingest.models import MAX_FILE_BYTES

    path = copy_sample(tmp_path)
    (tmp_path / "outside.pdf").write_bytes(b"%PDF")
    (path / "attachments" / "huge.pdf").write_bytes(b"0" * (MAX_FILE_BYTES + 1))
    meta = yaml.safe_load((path / "project.yaml").read_text(encoding="utf-8"))
    meta["files"] = [{"path": "../outside.pdf"}, {"path": "attachments/none.pdf"}, {"path": "attachments/huge.pdf"}]
    (path / "project.yaml").write_text(yaml.safe_dump(meta, allow_unicode=True), encoding="utf-8")
    errors = load_project(path).errors
    assert any("案件ディレクトリの中" in e for e in errors)
    assert any("ファイルがありません" in e for e in errors)
    assert any("10MB まで" in e for e in errors)

    meta["files"] = []
    meta["links"] = [{"title": "モック", "url": "figma.com/proto"}]
    (path / "project.yaml").write_text(yaml.safe_dump(meta, allow_unicode=True), encoding="utf-8")
    assert any("project.yaml" in e for e in load_project(path).errors)
