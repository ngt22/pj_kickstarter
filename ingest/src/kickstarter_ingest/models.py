"""原稿のスキーマ。YAML の構造をここで検証する。"""

import re
from datetime import date
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectMeta(Strict):
    """案件の基本情報（project.yaml）。"""

    # description は対話モードの質問を兼ねる（schema/project.json に出力される）
    id: str = Field(
        pattern=r"^[a-z0-9][a-z0-9-]*$",
        description="案件ID（英小文字・数字・ハイフン）。ディレクトリ名と同じにする。案件名から提案して確認する",
    )
    name: str = Field(description="案件名は何ですか？")
    summary: str = Field("", description="案件をひとことで説明すると？（一覧と表紙に表示）")
    status: Literal["draft", "proposed", "approved", "archived"] = Field(
        "draft", description="状態。draft（作成中）| proposed（提案済み）| approved（承認）| archived（終了）"
    )
    # 表紙に表示する項目（すべて省略可）
    client: str = Field("", description="提案先のクライアント名は？（例: 〇〇株式会社 様）")
    proposed_at: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="提案日は？（YYYY-MM-DD）")
    version: str = Field("", description="資料の版は？（例: 1.0）")
    # 表紙のキー色。サイトのテーマにある色の名前
    color: Literal[
        "brand", "blue", "indigo", "violet", "grape", "pink", "red", "orange", "yellow", "lime", "green", "teal", "cyan"
    ] = Field("brand", description="表紙のキー色（省略時は brand）")
    # 初期の閲覧者。新規案件の初回 push 時だけ access に追加する（以降は管理画面で管理する）
    members: list[str] = Field(
        [], description="この案件を閲覧するクライアントのメールアドレスは？（初回 push 時だけ閲覧権限に追加される）"
    )

    # push 前に原稿から探す語（社内のあだ名など）。サイトには送らない。サイト共通の禁止語は管理画面で設定する
    forbidden_terms: list[str] = Field([], description="クライアントに見せてはいけない語（社内のあだ名など）はありますか？")

    # サイトに送らない項目
    PRIVATE_FIELDS: ClassVar[set[str]] = {"members", "forbidden_terms"}

    # YAML は 2026-10-24 を日付型として読むので、文字列に戻す
    @field_validator("proposed_at", mode="before")
    @classmethod
    def date_to_str(cls, v: object) -> object:
        return v.isoformat() if isinstance(v, date) else v

    @field_validator("members")
    @classmethod
    def check_emails(cls, v: list[str]) -> list[str]:
        bad = [m for m in v if not EMAIL_RE.match(m)]
        if bad:
            raise ValueError(f"メールアドレスの形式が不正です: {bad}")
        return [m.lower() for m in v]


class DocHeader(BaseModel):
    """Markdown の front matter と YAML 原稿に共通する項目。"""

    title: str = Field(description="ページの見出し（サイドバーにも表示）")
    order: int = Field(description="サイドバーでの並び順（雛形の値のままでよい）")


class GlossaryTerm(Strict):
    term: str = Field(description="用語")
    reading: str | None = Field(None, description="読み（ひらがな）。一覧はこの読み順に並ぶ")
    definition: str = Field(description="意味")


class GlossaryDoc(DocHeader, Strict):
    terms: list[GlossaryTerm] = Field(description="業界や社内で使う、説明が必要な用語はありますか？")


class Risk(Strict):
    id: str = Field(description="リスクID（例: R-01）")
    title: str = Field(description="リスクの内容")
    probability: Literal["高", "中", "低"] = Field(description="発生確率")
    impact: Literal["高", "中", "低"] = Field(description="発生したときの影響")
    mitigation: str = Field(description="対策")
    owner: str | None = Field(None, description="担当")
    status: Literal["open", "closed"] = Field("open", description="open（対応中）| closed（解消）")


class RisksDoc(DocHeader, Strict):
    risks: list[Risk] = Field(description="想定されるリスクは何ですか？")


class EstimateItem(Strict):
    phase: str = Field(description="フェーズ（例: 要件定義、設計、開発、テスト）")
    task: str = Field(description="作業内容")
    person_months: float = Field(ge=0, description="工数（人月）")


class InitialCost(Strict):
    unit_price: int = Field(ge=0, description="人月単価はいくらですか？")
    items: list[EstimateItem] = Field(min_length=1, description="初期開発のフェーズごとの作業と工数はどのくらいですか？")


class MonthlyItem(Strict):
    name: str = Field(description="サービス名（例: 運用保守サービス）")
    amount: int = Field(ge=0, description="月額")
    # 内訳に金額を持たせない（サーバー・クラウド・API などの原価が構造上出ないようにする）
    includes: list[str] = Field([], description="含まれるもの（金額は書かない）")
    limits: str | None = Field(None, description="利用の上限や条件（例: 月間 1 万予約まで）")


class MonthlyCost(Strict):
    items: list[MonthlyItem] = Field(
        min_length=1,
        description="公開後に毎月いただく費用は？サーバー・クラウド・API などの原価は個別に書かず、"
        "運用保守サービスなどにまとめて「含まれるもの」に書く",
    )


class EstimateDoc(DocHeader, Strict):
    currency: str = Field("JPY", description="通貨")
    tax: Literal["excluded", "included"] = Field("excluded", description="金額が税抜（excluded）か税込（included）か")
    valid_until: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="見積もりの有効期限は？（YYYY-MM-DD）")
    initial: InitialCost = Field(description="初期費用（開発時に一度だけいただく費用）")
    monthly: MonthlyCost | None = Field(None, description="月額費用（公開後の継続利用料）")
    excludes: list[str] = Field([], description="見積もりに含まれない費用はありますか？（例: ドメイン取得費用）")
    terms: list[str] = Field([], description="支払条件などの取引条件は？（例: 納品検収後の翌月末払い）")
    notes: list[str] = Field([], description="そのほかの前提はありますか？")

    # 旧形式（トップレベルの unit_price と items）は初期費用として読む
    @model_validator(mode="before")
    @classmethod
    def legacy_to_initial(cls, v: Any) -> Any:
        if isinstance(v, dict) and "initial" not in v and "items" in v:
            v = dict(v)
            v["initial"] = {"unit_price": v.pop("unit_price", None), "items": v.pop("items")}
        return v

    @field_validator("valid_until", mode="before")
    @classmethod
    def date_to_str(cls, v: object) -> object:
        return v.isoformat() if isinstance(v, date) else v


class ApiDoc(DocHeader, Strict):
    spec: dict[str, Any] = Field(description="OpenAPI 3 の仕様（openapi と paths が必要）")

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
    id: str | None = Field(None, description="ほかのタスクの after から参照するときの id")
    name: str = Field(description="タスク名")
    start: date | None = Field(None, description="開始日。start も after もなければ直前のタスクの続き")
    after: str | list[str] | None = Field(None, description="先行タスクの id（先に書かれたタスクだけ）")
    days: int | None = Field(default=None, ge=0, description="日数。days か end のどちらかが必要（マイルストーンは不要）")
    end: date | None = Field(None, description="終了日")
    milestone: bool = Field(False, description="true でマイルストーン（◆）")
    progress: int | None = Field(default=None, ge=0, le=100, description="進捗（%）")
    owner: str | None = Field(None, description="担当")

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
    """```gantt ブロック（ロードマップのスケジュール）。"""

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


def _mock_body_schema(schema: dict[str, Any]) -> None:
    parts = [f"{k} {{{', '.join(sorted(v))}}}" if v else k for k, v in MOCK_ELEMENTS.items()]
    schema["items"] = {
        "type": "object",
        "minProperties": 1,
        "maxProperties": 1,
        "propertyNames": {"enum": list(MOCK_ELEMENTS)},
        "description": "「- 種類: 中身」の形の部品。使える部品と項目: " + " / ".join(parts),
    }


class MockBlock(Strict):
    """```mock ブロック（画面モック）。部品を上から並べる。"""

    device: Literal["desktop", "mobile"] = Field("desktop", description="枠の形")
    title: str | None = Field(None, description="アドレスバーに出す文字（例: /reservations）")
    body: list[Any] = Field(min_length=1, json_schema_extra=_mock_body_schema)

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
    fk: str | None = Field(None, description="参照先。「テーブル名」または「テーブル名.列名」")
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
    """```er ブロック（ER図）。"""

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
