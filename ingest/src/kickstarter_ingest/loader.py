"""案件ディレクトリを読み込み、検証済みのドキュメント一覧を返す。"""

import hashlib
import mimetypes
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ValidationError

from .doctypes import DOC_TYPES
from .models import BLOCK_MODELS, MAX_FILE_BYTES, YAML_MODELS, DocHeader, ProjectMeta

# Firestore の 1 ドキュメントは 1MiB まで。ファイルはこの大きさに分けて blobs に保存する
CHUNK_BYTES = 900 * 1024


@dataclass
class LoadedDoc:
    type: str
    title: str
    order: int  # DOC_TYPES の順（原稿の order は使わない）
    format: str
    body: str  # 原文。YAML もパースせず原文のまま保存し、ブラウザ側で解釈する


@dataclass
class LoadedFile:
    """補足資料のファイル。id は中身のハッシュなので、変えていないファイルは push で送り直さない。"""

    id: str
    title: str
    note: str
    name: str
    content_type: str
    data: bytes

    def chunks(self) -> list[bytes]:
        return [self.data[i : i + CHUNK_BYTES] for i in range(0, len(self.data), CHUNK_BYTES)] or [b""]

    def blob_ids(self) -> list[str]:
        return [f"{self.id}-{i}" for i in range(len(self.chunks()))]

    def record(self) -> dict:
        """案件ドキュメントの files に載せる情報（中身は blobs に分けて置く）。"""
        return {
            "id": self.id,
            "title": self.title,
            "note": self.note,
            "name": self.name,
            "content_type": self.content_type,
            "size": len(self.data),
            "chunks": len(self.chunks()),
        }


@dataclass
class LoadResult:
    meta: ProjectMeta | None = None
    meta_text: str | None = None  # project.yaml の原文（表現チェック用）
    docs: list[LoadedDoc] = field(default_factory=list)
    files: list[LoadedFile] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)  # push は止めないが確認してほしいこと
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
        result.meta_text = meta_file.read_text(encoding="utf-8")
        result.meta = ProjectMeta.model_validate(yaml.safe_load(result.meta_text))
    except FileNotFoundError:
        result.errors.append("project.yaml: ファイルがありません")
    except (ValidationError, yaml.YAMLError) as e:
        result.errors.append(f"project.yaml: {e}")

    if result.meta and result.meta.id != path.name:
        result.errors.append(f"project.yaml: id '{result.meta.id}' がディレクトリ名 '{path.name}' と一致しません")

    if result.meta:
        result.files, file_errors = load_files(path, result.meta)
        result.errors.extend(file_errors)

    for order, dt in enumerate(DOC_TYPES, start=1):
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
        result.docs.append(LoadedDoc(dt.key, parsed.title, order, dt.format, text))

    result.warnings.extend(check_screen_ids(result.docs))
    return result


def load_files(path: Path, meta: ProjectMeta) -> tuple[list[LoadedFile], list[str]]:
    """project.yaml の files に書いたファイルを読む。案件ディレクトリの外は読まない。"""
    files: list[LoadedFile] = []
    errors: list[str] = []
    root = path.resolve()
    for item in meta.files:
        file = (path / item.path).resolve()
        label = f"project.yaml: files の {item.path}"
        if not file.is_relative_to(root):
            errors.append(f"{label}: 案件ディレクトリの中に置いてください")
            continue
        if not file.is_file():
            errors.append(f"{label}: ファイルがありません")
            continue
        size = file.stat().st_size
        if size > MAX_FILE_BYTES:
            errors.append(f"{label}: {size / 1024 / 1024:.1f}MB あります。1 ファイル {MAX_FILE_BYTES // 1024 // 1024}MB までにしてください")
            continue
        data = file.read_bytes()
        file_id = hashlib.sha256(data).hexdigest()[:24]
        if any(f.id == file_id for f in files):
            errors.append(f"{label}: 同じ中身のファイルがすでに files にあります")
            continue
        content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        files.append(LoadedFile(file_id, item.title or file.stem, item.note, file.name, content_type, data))
    return files, errors


SCREEN_HEADING_RE = re.compile(r"^##\s+(SC-[\w-]+)", re.M)


def check_screen_ids(docs: list[LoadedDoc]) -> list[str]:
    """画面仕様（## SC-xx と ```mock の to:）とページ遷移図（```flow の screens）の画面IDを突き合わせる。"""
    bodies = {d.type: d.body for d in docs}
    flow_ids: set[str] = set()
    for m in FENCE_RE.finditer(bodies.get("page-flow", "")):
        if m.group(1) == "flow":
            spec = yaml.safe_load(m.group(2)) or {}
            flow_ids |= {s["id"] for s in spec.get("screens", [])}
    screens = bodies.get("screens", "")
    headings = SCREEN_HEADING_RE.findall(screens)
    known = flow_ids | set(headings)
    warnings = []
    if flow_ids:
        for sc in headings:
            if sc not in flow_ids:
                warnings.append(f"screens.md: {sc} がページ遷移図（page-flow.md の ```flow）にありません")
    targets: list[str] = []
    for m in FENCE_RE.finditer(screens):
        if m.group(1) == "mock":
            targets += re.findall(r"\bto:\s*([\w-]+)", m.group(2))
    for to in dict.fromkeys(targets):
        if known and to not in known:
            warnings.append(f"screens.md: 画面モックの遷移先 {to} が、画面仕様の見出しにもページ遷移図にもありません")
    # ユースケース図の screen: も同じ画面IDにそろえる
    for d in docs:
        for m in FENCE_RE.finditer(d.body if d.format == "markdown" else ""):
            if m.group(1) != "usecase":
                continue
            spec = yaml.safe_load(m.group(2)) or {}
            for c in spec.get("cases", []):
                ids = c.get("screen") or []
                for sc in [ids] if isinstance(ids, str) else ids:
                    if known and sc not in known:
                        warnings.append(f"{d.type}.md: ユースケース {c.get('id')} の画面 {sc} が、画面仕様の見出しにもページ遷移図にもありません")
    return warnings
