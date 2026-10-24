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
    members: list[str] = Field(min_length=1)

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


BLOCK_MODELS: dict[str, type[BaseModel]] = {
    "gantt": GanttBlock,
}
