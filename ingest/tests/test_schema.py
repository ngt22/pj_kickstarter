import json

from kickstarter_ingest.cli import main
from kickstarter_ingest.doctypes import DOC_TYPES
from kickstarter_ingest.loader import load_project
from kickstarter_ingest.models import YAML_MODELS
from kickstarter_ingest.schema import TEMPLATES, llms_txt, schema_index, schema_models


def test_every_doc_type_has_questions():
    for dt in DOC_TYPES:
        assert dt.questions, dt.key


def test_index_points_to_existing_schemas_and_templates():
    names = {f"{n}.json" for n in schema_models()}
    index = schema_index()
    assert index["project"]["schema"] in names
    for doc in index["docs"]:
        assert doc["schema"] in names
        assert set(doc["blocks"]) <= names
        assert (TEMPLATES / doc["file"]).exists()


def test_yaml_doc_fields_have_descriptions():
    # description は対話モードの質問を兼ねるので、YAML 原稿の項目には必ず付ける
    for name in ("project", *YAML_MODELS):
        schema = schema_models()[name].model_json_schema()
        for field, prop in schema["properties"].items():
            assert prop.get("description"), f"{name}.{field}"


def test_schema_command_writes_files(tmp_path, capsys):
    assert main(["schema", "--out", str(tmp_path)]) == 0
    risks = json.loads((tmp_path / "risks.json").read_text(encoding="utf-8"))
    assert risks["properties"]["risks"]["description"]
    assert main(["schema", "nothing"]) == 1


def test_site_assets(tmp_path):
    assert main(["site-assets", str(tmp_path)]) == 0
    assert (tmp_path / "schema" / "index.json").exists()
    assert (tmp_path / "templates" / "project.yaml").exists()
    text = (tmp_path / "llms.txt").read_text(encoding="utf-8")
    for dt in DOC_TYPES:
        assert dt.filename in text
        assert dt.questions[0] in text


def test_llms_txt_uses_cli_source():
    assert "uvx --from git+https://example.com/x kickstarter-ingest init" in llms_txt("git+https://example.com/x")


def test_init_scaffolds_valid_project(tmp_path):
    assert main(["init", "new-project", "--parent", str(tmp_path)]) == 0
    result = load_project(tmp_path / "new-project")
    assert result.errors == []
    assert result.meta.id == "new-project"
    # 記入例の閲覧者は持ち込まない
    assert result.meta.members == []
    assert len(result.docs) == len(DOC_TYPES)
    assert main(["init", "new-project", "--parent", str(tmp_path)]) == 1
