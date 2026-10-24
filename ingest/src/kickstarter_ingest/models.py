"""原稿のスキーマ。YAML の構造をここで検証する。"""

import re
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectMeta(Strict):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str
    summary: str = ""
    status: Literal["draft", "proposed", "approved", "archived"] = "draft"
    # 初期の閲覧者。新規案件の初回 push 時だけ access に追加する（以降は管理画面で管理する）
    members: list[str] = []

    @field_validator("members")
    @classmethod
    def check_emails(cls, v: list[str]) -> list[str]:
        bad = [m for m in v if not EMAIL_RE.match(m)]
        if bad:
            raise ValueError(f"メールアドレスの形式が不正です: {bad}")
        return [m.lower() for m in v]


class DocHeader(BaseModel):
    """Markdown の front matter と YAML 原稿に共通する項目。"""

    title: str
    order: int


class GlossaryTerm(Strict):
    term: str
    reading: str | None = None
    definition: str


class GlossaryDoc(DocHeader, Strict):
    terms: list[GlossaryTerm]


class Risk(Strict):
    id: str
    title: str
    probability: Literal["高", "中", "低"]
    impact: Literal["高", "中", "低"]
    mitigation: str
    owner: str | None = None
    status: Literal["open", "closed"] = "open"


class RisksDoc(DocHeader, Strict):
    risks: list[Risk]


class EstimateItem(Strict):
    phase: str
    task: str
    person_months: float = Field(ge=0)


class EstimateDoc(DocHeader, Strict):
    currency: str = "JPY"
    unit_price: int = Field(ge=0)
    items: list[EstimateItem]
    notes: list[str] = []


class ApiDoc(DocHeader, Strict):
    spec: dict[str, Any]

    @field_validator("spec")
    @classmethod
    def check_openapi(cls, v: dict[str, Any]) -> dict[str, Any]:
        if "openapi" not in v or "paths" not in v:
            raise ValueError("spec には openapi と paths が必要です")
        return v


YAML_MODELS: dict[str, type[DocHeader]] = {
    "glossary": GlossaryDoc,
    "risks": RisksDoc,
    "estimate": EstimateDoc,
    "api": ApiDoc,
}


# --- Markdown 内の図（```gantt などのコードブロックに YAML で書く） ---


class GanttTask(Strict):
    id: str | None = None
    name: str
    start: date | None = None
    after: str | list[str] | None = None
    days: int | None = Field(default=None, ge=0)
    end: date | None = None
    milestone: bool = False
    progress: int | None = Field(default=None, ge=0, le=100)
    owner: str | None = None

    @model_validator(mode="after")
    def check_length(self) -> "GanttTask":
        if not self.milestone and self.days is None and self.end is None:
            raise ValueError(f"「{self.name}」に days か end が必要です")
        return self

    @property
    def deps(self) -> list[str]:
        if self.after is None:
            return []
        return [self.after] if isinstance(self.after, str) else self.after


class GanttSection(Strict):
    name: str
    tasks: list[GanttTask] = Field(min_length=1)


class GanttBlock(Strict):
    title: str | None = None
    start: date | None = None
    sections: list[GanttSection] = Field(min_length=1)

    @model_validator(mode="after")
    def check_refs(self) -> "GanttBlock":
        seen: set[str] = set()
        first = True
        for section in self.sections:
            for t in section.tasks:
                for d in t.deps:
                    if d not in seen:
                        raise ValueError(f"「{t.name}」の after: {d} が見つかりません（先に書かれたタスクの id を指定してください）")
                if first and t.start is None and not t.deps and self.start is None:
                    raise ValueError(f"最初のタスク「{t.name}」に start が必要です")
                first = False
                if t.id:
                    if t.id in seen:
                        raise ValueError(f"id が重複しています: {t.id}")
                    seen.add(t.id)
        return self


# 画面モック（```mock）の部品と、それぞれに書ける項目。web/src/components/ScreenMock.tsx と揃える
# None は中身を自由に書ける部品（文字列や数値の短縮形のみ）
MOCK_ELEMENTS: dict[str, set[str] | None] = {
    "header": {"title", "links", "actions", "note"},
    "heading": {"text", "level", "note"},
    "text": {"text", "dimmed", "note"},
    "input": {"label", "type", "placeholder", "value", "required", "help", "error", "note"},
    "select": {"label", "options", "value", "required", "note"},
    "checkbox": {"label", "checked", "note"},
    "radio": {"label", "options", "value", "note"},
    "button": {"label", "variant", "to", "disabled", "full", "note"},
    "buttons": {"items", "align"},
    "row": {"items"},
    "card": {"title", "items", "note"},
    "table": {"columns", "rows", "note"},
    "list": {"items", "note"},
    "tabs": {"items", "active", "note"},
    "alert": {"title", "text", "color", "note"},
    "image": {"label", "height", "note"},
    "divider": None,
    "space": None,
}
BUTTON_KEYS = MOCK_ELEMENTS["button"]
CONTAINERS = {"row", "card"}


def check_mock_elements(items: Any, where: str = "body") -> None:
    if not isinstance(items, list):
        raise ValueError(f"{where} は部品のリストにしてください")
    for i, el in enumerate(items):
        path = f"{where}[{i}]"
        if not isinstance(el, dict) or len(el) != 1:
            raise ValueError(f"{path}: 部品は「- 種類: 中身」の形で1つずつ書いてください")
        kind, value = next(iter(el.items()))
        if kind not in MOCK_ELEMENTS:
            raise ValueError(f"{path}: 不明な部品 {kind}（使える部品: {', '.join(MOCK_ELEMENTS)}）")
        allowed = MOCK_ELEMENTS[kind]
        if kind in ("buttons", "row", "list", "tabs") and isinstance(value, list):
            value = {"items": value}
        if isinstance(value, dict) and allowed is not None:
            unknown = set(value) - allowed
            if unknown:
                raise ValueError(f"{path}: {kind} に書けない項目 {sorted(unknown)}（書ける項目: {sorted(allowed)}）")
            if kind in CONTAINERS and "items" in value:
                check_mock_elements(value["items"], f"{path}.{kind}")
            if kind == "buttons":
                for b in value.get("items", []):
                    if isinstance(b, dict) and set(b) - BUTTON_KEYS:
                        raise ValueError(f"{path}: ボタンに書けない項目 {sorted(set(b) - BUTTON_KEYS)}")
            if kind == "header":
                for b in value.get("actions", []):
                    if isinstance(b, dict) and set(b) - BUTTON_KEYS:
                        raise ValueError(f"{path}: ボタンに書けない項目 {sorted(set(b) - BUTTON_KEYS)}")


class MockBlock(Strict):
    device: Literal["desktop", "mobile"] = "desktop"
    title: str | None = None
    body: list[Any] = Field(min_length=1)

    @field_validator("body")
    @classmethod
    def check_body(cls, v: list[Any]) -> list[Any]:
        check_mock_elements(v)
        return v


class ErDomain(Strict):
    id: str
    name: str | None = None
    color: str | None = None


class ErColumn(Strict):
    name: str
    type: str | None = None
    pk: bool = False
    fk: str | None = None  # "テーブル名" または "テーブル名.列名"
    unique: bool = False
    nullable: bool = False
    note: str | None = None


class ErTable(Strict):
    name: str
    label: str | None = None
    domain: str | None = None
    note: str | None = None
    columns: list[ErColumn] = Field(min_length=1)


class ErBlock(Strict):
    domains: list[ErDomain] = []
    tables: list[ErTable] = Field(min_length=1)

    @model_validator(mode="after")
    def check_refs(self) -> "ErBlock":
        domains = {d.id for d in self.domains}
        tables = {t.name: t for t in self.tables}
        if len(tables) != len(self.tables):
            raise ValueError("テーブル名が重複しています")
        for t in self.tables:
            if t.domain is not None and t.domain not in domains:
                raise ValueError(f"テーブル {t.name} の domain: {t.domain} が domains にありません")
            for c in t.columns:
                if not c.fk:
                    continue
                name, _, col = c.fk.partition(".")
                target = tables.get(name)
                if target is None:
                    raise ValueError(f"{t.name}.{c.name} の参照先 {c.fk} がありません")
                col = col or next((x.name for x in target.columns if x.pk), "")
                if not any(x.name == col for x in target.columns):
                    raise ValueError(f"{t.name}.{c.name} の参照先の列 {c.fk} がありません")
        return self


BLOCK_MODELS: dict[str, type[BaseModel]] = {
    "gantt": GanttBlock,
    "mock": MockBlock,
    "er": ErBlock,
}
