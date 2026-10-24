"""案件ディレクトリを読み込み、検証済みのドキュメント一覧を返す。"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from .doctypes import DOC_TYPES
from .models import BLOCK_MODELS, YAML_MODELS, DocHeader, ProjectMeta


@dataclass
class LoadedDoc:
    type: str
    title: str
    order: int
    format: str
    body: str  # 原文。YAML もパースせず原文のまま保存し、ブラウザ側で解釈する


@dataclass
class LoadResult:
    meta: ProjectMeta | None = None
    docs: list[LoadedDoc] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)


def split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("front matter の終わり（---）がありません")
    return yaml.safe_load(parts[1]) or {}, parts[2].lstrip("\n")


FENCE_RE = re.compile(r"^```([\w-]+)[ \t]*\n(.*?)^```", re.M | re.S)


def check_blocks(body: str) -> list[str]:
    """```gantt などの図のコードブロックを検証し、エラーメッセージを返す。"""
    errors = []
    for m in FENCE_RE.finditer(body):
        lang, source = m.group(1), m.group(2)
        model = BLOCK_MODELS.get(lang)
        if model is None:
            continue
        line = body.count("\n", 0, m.start()) + 1
        try:
            model.model_validate(yaml.safe_load(source))
        except (ValidationError, yaml.YAMLError) as e:
            errors.append(f"{lang} ブロック（本文 {line} 行目）: {e}")
    return errors


def load_project(path: Path) -> LoadResult:
    result = LoadResult()

    meta_file = path / "project.yaml"
    try:
        result.meta = ProjectMeta.model_validate(yaml.safe_load(meta_file.read_text(encoding="utf-8")))
    except FileNotFoundError:
        result.errors.append("project.yaml: ファイルがありません")
    except (ValidationError, yaml.YAMLError) as e:
        result.errors.append(f"project.yaml: {e}")

    if result.meta and result.meta.id != path.name:
        result.errors.append(f"project.yaml: id '{result.meta.id}' がディレクトリ名 '{path.name}' と一致しません")

    for dt in DOC_TYPES:
        file = path / dt.filename
        if not file.exists():
            result.missing.append(dt.filename)
            continue
        text = file.read_text(encoding="utf-8")
        try:
            if dt.format == "markdown":
                header, body = split_front_matter(text)
                parsed = DocHeader.model_validate(header)
                block_errors = check_blocks(body)
                if block_errors:
                    result.errors.extend(f"{dt.filename}: {e}" for e in block_errors)
                    continue
            else:
                parsed = YAML_MODELS[dt.key].model_validate(yaml.safe_load(text))
        except (ValidationError, ValueError, yaml.YAMLError) as e:
            result.errors.append(f"{dt.filename}: {e}")
            continue
        result.docs.append(LoadedDoc(dt.key, parsed.title, parsed.order, dt.format, text))

    return result
