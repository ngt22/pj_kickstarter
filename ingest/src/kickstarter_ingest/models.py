"""原稿のスキーマ。YAML の構造をここで検証する。"""

import re
from datetime import date
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MaterialLink(Strict):
    """補足資料のリンク（画面モック、参考サイトなど）。"""

    title: str = Field(description="リンクの名前（例: 画面モック（Figma））")
    url: str = Field(pattern=r"^https?://\S+$", description="URL（https://...）")
    note: str = Field("", description="ひとことの説明（例: 予約から完了までを操作できます）")


# 1 ファイルの上限。Firestore に分割して保存するので、無理なく読み込める大きさにとどめる
MAX_FILE_BYTES = 10 * 1024 * 1024


class MaterialFile(Strict):
    """補足資料のファイル（PDF など）。原稿のディレクトリに置き、push でサイトに送る。"""

    path: str = Field(description="案件ディレクトリからの相対パス（例: attachments/会社案内.pdf）。1 ファイル 10MB まで")
    title: str = Field("", description="一覧に出す名前（省略するとファイル名）")
    note: str = Field("", description="ひとことの説明")


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

    # 補足資料（表紙と「補足資料」のページに一覧で出る）
    links: list[MaterialLink] = Field(
        [], description="画面モックや参考サイトなど、資料と一緒に見てほしい URL はありますか？"
    )
    files: list[MaterialFile] = Field(
        [], description="会社案内や既存の資料など、一緒に渡したいファイル（PDF など）はありますか？"
    )

    # push 前に原稿から探す語（社内のあだ名など）。サイトには送らない。サイト共通の禁止語は管理画面で設定する
    forbidden_terms: list[str] = Field([], description="クライアントに見せてはいけない語（社内のあだ名など）はありますか？")

    # サイトに送らない項目
    PRIVATE_FIELDS: ClassVar[set[str]] = {"members", "forbidden_terms"}
    # 原稿の形のままでは送らない項目（files は読み込んだファイルの情報に置き換えて送る）
    SITE_EXCLUDE: ClassVar[set[str]] = PRIVATE_FIELDS | {"files"}

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
    # 画面の骨組み: 先頭の header は上のバー、nav は横のメニュー、tabbar は下のタブ、footer は最下部
    "header": {"title", "links", "actions", "action", "back", "note"},
    "nav": {"brand", "items", "active", "note"},
    "tabbar": {"items", "active", "note"},
    "footer": {"text", "links", "note"},
    "heading": {"text", "level", "note"},
    "text": {"text", "dimmed", "note"},
    "input": {"label", "type", "placeholder", "value", "required", "help", "error", "note"},
    "search": {"placeholder", "note"},
    "select": {"label", "options", "value", "required", "note"},
    "checkbox": {"label", "checked", "note"},
    "radio": {"label", "options", "value", "note"},
    "button": {"label", "variant", "to", "disabled", "full", "note"},
    "buttons": {"items", "align"},
    "row": {"items"},
    "card": {"title", "items", "note"},
    "stats": {"items", "note"},
    "table": {"columns", "rows", "note"},
    "list": {"items", "note"},
    "tabs": {"items", "active", "note"},
    "breadcrumb": {"items", "note"},
    "stepper": {"items", "active", "note"},
    "pagination": {"total", "page", "note"},
    "avatar": {"name", "role", "note"},
    "badge": {"text", "color", "note"},
    "alert": {"title", "text", "color", "note"},
    "toast": {"title", "text", "tone", "note"},
    "empty": {"title", "hint", "action", "note"},
    "image": {"label", "height", "note"},
    "drawing": {"title", "floors", "floor", "rooms", "pins", "selected", "note"},
    "divider": None,
    "space": None,
}
# list の行（{title, sub, ...} で書いたとき）と、stats の数値カードに書ける項目
LIST_ITEM_KEYS = {"title", "sub", "meta", "badge", "thumb", "avatar", "to"}
STAT_KEYS = {"label", "value", "delta"}
PIN_KEYS = {"x", "y", "label", "status", "text"}
PIN_STATUSES = {"new", "prev", "done"}
LIST_KINDS = {"buttons", "row", "list", "tabs", "nav", "tabbar", "breadcrumb", "stats", "stepper"}
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
        if kind in LIST_KINDS and isinstance(value, list):
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
                for b in [*value.get("actions", []), value.get("action")]:
                    if isinstance(b, dict) and set(b) - BUTTON_KEYS:
                        raise ValueError(f"{path}: ボタンに書けない項目 {sorted(set(b) - BUTTON_KEYS)}")
            if kind == "drawing":
                for pin in value.get("pins", []):
                    if not isinstance(pin, dict) or set(pin) - PIN_KEYS:
                        raise ValueError(f"{path}: ピンは {{x, y, label, status, text}} で書いてください")
                    for axis in ("x", "y"):
                        v = pin.get(axis)
                        if not isinstance(v, (int, float)) or not 0 <= v <= 100:
                            raise ValueError(f"{path}: ピンの {axis} は図面に対する % （0〜100）で書いてください")
                    if pin.get("status", "new") not in PIN_STATUSES:
                        raise ValueError(f"{path}: ピンの status は {', '.join(sorted(PIN_STATUSES))} のどれかです")
            item_keys = {"list": LIST_ITEM_KEYS, "stats": STAT_KEYS}.get(kind)
            for it in value.get("items", []) if item_keys else []:
                if isinstance(it, dict) and set(it) - item_keys:
                    raise ValueError(f"{path}: {kind} の行に書けない項目 {sorted(set(it) - item_keys)}（書ける項目: {sorted(item_keys)}）")


def _mock_body_schema(schema: dict[str, Any]) -> None:
    parts = [f"{k} {{{', '.join(sorted(v))}}}" if v else k for k, v in MOCK_ELEMENTS.items()]
    schema["items"] = {
        "type": "object",
        "minProperties": 1,
        "maxProperties": 1,
        "propertyNames": {"enum": list(MOCK_ELEMENTS)},
        "description": "「- 種類: 中身」の形の部品。使える部品と項目: " + " / ".join(parts),
    }


Device = Literal["desktop", "tablet", "mobile"]


class MockBlock(Strict):
    """```mock ブロック（画面モック）。部品を上から並べる。"""

    device: Device = Field("desktop", description="最初に見せる端末")
    devices: list[Device] | None = Field(
        None, min_length=1, description="切り替えで見せる端末（省略時は desktop と mobile。tablet は書いたときだけ出る）"
    )
    pwa: bool = Field(False, description="true でブラウザ表示とアプリ（PWA）表示を切り替えられる")
    display: Literal["browser", "pwa"] | None = Field(None, description="最初に見せる表示（pwa を書くと切り替えも出る）")
    app: str | None = Field(None, description="PWA 表示のタイトルバーに出すアプリ名（省略時は header の title）")
    title: str | None = Field(None, description="アドレスバーに出す文字（例: /reservations）")
    body: list[Any] = Field(min_length=1, json_schema_extra=_mock_body_schema)

    @model_validator(mode="after")
    def check_devices(self) -> "MockBlock":
        if self.devices is not None and self.device not in self.devices:
            raise ValueError(f"device: {self.device} が devices にありません")
        return self

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


ThemeColor = Literal[
    "brand", "blue", "indigo", "violet", "grape", "pink", "red", "orange", "yellow", "lime", "green", "teal", "cyan", "gray"
]


class UsecaseZone(Strict):
    id: str = Field(description="actors の zone と flows から参照する id")
    name: str = Field(description="区画名（例: 現地、事務所、お客さま、店舗）")
    note: str | None = Field(None, description="区画の補足（例: タブレット・スマホ／電波がなくても動作）")
    color: ThemeColor | None = Field(None, description="区画の札の色（省略すると最初のアクターの色）")


class UsecaseActor(Strict):
    id: str = Field(description="cases の actors から参照する id")
    name: str = Field(description="アクター名（例: 利用者、店舗スタッフ、決済サービス）")
    note: str | None = Field(None, description="補足（例: 30代・会社員、タブレット）")
    zone: str | None = Field(None, description="置く区画の id（省略すると最初の区画）")
    kind: Literal["person", "system"] = Field("person", description="person: 人 / system: 外部サービスなど人以外")
    inherits: str | None = Field(None, description="このアクターが全操作を引き継ぐ別のアクターの id（例: 管理者 → 事務員）")
    side: Literal["left", "right"] | None = Field(None, description="旧形式の項目。今は使わない")
    color: ThemeColor | None = Field(None, description="カードの色帯とアイコンの色（省略すると自動）")


class UsecaseCase(Strict):
    id: str = Field(description="relations から参照する id（例: UC-01）")
    name: str = Field(description="ユースケース名。「〜する」の形で全角16文字以内（例: 予約する）")
    actors: list[str] = Field([], description="このユースケースを使うアクターの id。最初のアクターの段に並ぶ")
    condition: str | None = Field(None, description="条件付きの操作の条件（例: 前回結果がある場合のみ）。点線のカードになる")
    note: str | None = Field(None, description="カードに小さく出す補足")


class UsecaseRelation(Strict):
    from_: str = Field(alias="from", description="元のユースケースの id")
    to: str = Field(description="先のユースケースの id")
    type: Literal["include", "extend"] = Field(
        description="include: from が必ず to を含む / extend: from が条件付きで to を拡張する"
    )


class UsecaseFlow(Strict):
    from_: str = Field(alias="from", description="受け渡し元の区画の id")
    to: str = Field(description="受け渡し先の区画の id（from と隣り合う区画）")
    label: str = Field(description="受け渡しの名前（例: 帰社後に同期）")
    note: str | None = Field(None, description="補足（例: 現地の記録・写真が事務所側へ渡る）")


class UsecaseBlock(Strict):
    """```usecase ブロック（ユースケース図）。区画 → アクターの段 → ユースケースのカードの順に並ぶ。"""

    system: str | None = Field(None, description="システムの名前（zones を省略したときの区画名）")
    zones: list[UsecaseZone] = []
    actors: list[UsecaseActor] = Field(min_length=1)
    cases: list[UsecaseCase] = Field(min_length=1)
    relations: list[UsecaseRelation] = []
    flows: list[UsecaseFlow] = []

    @model_validator(mode="after")
    def check_refs(self) -> "UsecaseBlock":
        zones = [z.id for z in self.zones]
        actors = [a.id for a in self.actors]
        cases = [c.id for c in self.cases]
        for kind, ids in (("区画", zones), ("アクター", actors), ("ユースケース", cases)):
            dup = sorted({i for i in ids if ids.count(i) > 1})
            if dup:
                raise ValueError(f"{kind}の id が重複しています: {dup}")
        for a in self.actors:
            if a.zone is not None and a.zone not in zones:
                raise ValueError(f"アクター {a.id} の zone: {a.zone} がありません（候補: {', '.join(zones) or 'zones が未記入'}）")
            if a.inherits is not None and a.inherits not in actors:
                raise ValueError(f"アクター {a.id} の inherits: {a.inherits} がありません（候補: {', '.join(actors)}）")
        for c in self.cases:
            for a in c.actors:
                if a not in actors:
                    raise ValueError(f"ユースケース {c.id} の actors: {a} がありません（候補: {', '.join(actors)}）")
        for r in self.relations:
            for end in (r.from_, r.to):
                if end not in cases:
                    raise ValueError(f"relations の {end} がユースケースにありません（候補: {', '.join(cases)}）")
        for f in self.flows:
            for end in (f.from_, f.to):
                if end not in zones:
                    raise ValueError(f"flows の {end} が区画にありません（候補: {', '.join(zones) or 'zones が未記入'}）")
            if abs(zones.index(f.from_) - zones.index(f.to)) != 1:
                raise ValueError(f"flows の {f.from_} → {f.to}: 隣り合う区画どうしにしてください")
        return self


class FlowLane(Strict):
    id: str = Field(description="screens と terminals の lane から参照する id")
    name: str = Field(description="レーン名（例: 日常業務、設定（管理者））")
    note: str | None = Field(None, description="カードの右に出す補足（例: 業務の流れとは独立した設定画面）")


class FlowZone(Strict):
    id: str = Field(description="screens・terminals の zone と flows から参照する id")
    name: str = Field(description="区画名（例: 現地、事務所、お客さま、店舗）")
    note: str | None = Field(None, description="区画の補足（例: タブレット・スマホ／電波がなくても動作）")
    color: ThemeColor | None = Field(None, description="区画の色（省略すると自動）")
    footnote: str | None = Field(None, description="区画の下に小さく出す注記（例: SC-06〜SC-09 は将来の拡張用）")
    lanes: list[FlowLane] = []


class FlowScreen(Strict):
    id: str = Field(description="画面ID。画面仕様の見出し（## SC-01 …）と同じにする")
    name: str = Field(description="画面名（全角12文字以内が目安）。アイコンは名前から自動で付く")
    zone: str | None = Field(None, description="置く区画の id（省略すると最初の区画）")
    lane: str | None = Field(None, description="置くレーンの id（省略すると区画の最初のレーン）")


class FlowTerminal(Strict):
    id: str = Field(description="edges から参照する id")
    label: str = Field(description="丸に出す文字（例: 開始、提出）。2〜3文字")
    zone: str | None = None
    lane: str | None = None


class FlowEdge(Strict):
    from_: str = Field(alias="from", description="遷移元の画面・丸の id")
    to: str = Field(description="遷移先の画面・丸の id（同じレーンの中）")
    label: str | None = Field(None, description="線に添える操作（例: 案件を開く）")
    type: Literal["go", "back"] = Field("go", description="go: 進む / back: 確定・キャンセルで戻る（点線）")


class FlowSync(Strict):
    from_: str = Field(alias="from", description="受け渡し元の区画の id")
    to: str = Field(description="受け渡し先の区画の id（from と隣り合う区画）")
    label: str = Field(description="受け渡しの名前（例: 帰社後に同期）")
    note: str | None = None


class FlowBlock(Strict):
    """```flow ブロック（ページ遷移図）。区画 → レーンの中に画面を左から右へ並べる。"""

    zones: list[FlowZone] = Field(min_length=1)
    screens: list[FlowScreen] = Field(min_length=1)
    terminals: list[FlowTerminal] = []
    edges: list[FlowEdge] = []
    flows: list[FlowSync] = []
    notes: list[str] = []

    @model_validator(mode="after")
    def check_refs(self) -> "FlowBlock":
        zones = {z.id: z for z in self.zones}
        nodes = [n.id for n in [*self.screens, *self.terminals]]
        for kind, ids in (("区画", [z.id for z in self.zones]), ("画面・丸", nodes)):
            dup = sorted({i for i in ids if ids.count(i) > 1})
            if dup:
                raise ValueError(f"{kind}の id が重複しています: {dup}")
        place: dict[str, str] = {}
        for n in [*self.screens, *self.terminals]:
            zone = zones.get(n.zone) if n.zone is not None else self.zones[0]
            if zone is None:
                raise ValueError(f"{n.id} の zone: {n.zone} がありません（候補: {', '.join(zones)}）")
            lanes = [l.id for l in zone.lanes]
            if n.lane is not None and n.lane not in lanes:
                raise ValueError(f"{n.id} の lane: {n.lane} が区画 {zone.id} にありません（候補: {', '.join(lanes) or 'lanes が未記入'}）")
            place[n.id] = f"{zone.id}/{n.lane or (lanes[0] if lanes else '')}"
        for e in self.edges:
            for end in (e.from_, e.to):
                if end not in place:
                    raise ValueError(f"edges の {end} が画面・丸にありません（候補: {', '.join(nodes)}）")
            if place[e.from_] != place[e.to]:
                raise ValueError(
                    f"edges の {e.from_} → {e.to}: 線は同じ区画・レーンの中だけです（区画の間は flows、レーンの間は note で補足）"
                )
        ids = list(zones)
        for f in self.flows:
            for end in (f.from_, f.to):
                if end not in zones:
                    raise ValueError(f"flows の {end} が区画にありません（候補: {', '.join(ids)}）")
            if abs(ids.index(f.from_) - ids.index(f.to)) != 1:
                raise ValueError(f"flows の {f.from_} → {f.to}: 隣り合う区画どうしにしてください")
        return self


ArchKind = Literal["user", "device", "web", "app", "server", "function", "db", "storage", "auth", "queue", "mail", "external", "batch"]


class ArchZone(Strict):
    id: str = Field(description="nodes の zone から参照する id")
    name: str = Field(description="区画名（例: 利用者の端末、クラウド、外部サービス、社内システム）")
    note: str | None = Field(None, description="区画の補足（例: Firebase（東京リージョン））")
    color: ThemeColor | None = Field(None, description="区画の色（省略すると自動）")
    external: bool = Field(False, description="true にすると点線の枠で描く（外部サービス・既存システムなど）")


class ArchNode(Strict):
    id: str = Field(description="links から参照する id")
    name: str = Field(description="役割の名前（例: 予約サイト、予約データ）。全角10文字以内が目安")
    kind: ArchKind = Field(
        "server",
        description="種類（アイコン）: user 利用者 / device 端末 / web 画面 / app アプリ / server / function / db / storage / auth / queue / mail / external 外部API / batch 定期処理",
    )
    tech: str | None = Field(None, description="技術名（例: Firestore、Cloud Functions）。カードの上に小さく出る")
    note: str | None = Field(None, description="カードの下に小さく出す補足")
    zone: str | None = Field(None, description="置く区画の id（省略すると最初の区画）")


class ArchLink(Strict):
    from_: str = Field(alias="from", description="線の元の id")
    to: str = Field(description="線の先の id")
    label: str | None = Field(None, description="線に添える文字（例: 予約の読み書き）")
    type: Literal["sync", "async"] = Field("sync", description="sync: 通信・呼び出し / async: 通知・定期処理など（点線）")
    both: bool = Field(False, description="true にすると両方向の矢印")


class ArchBlock(Strict):
    """```arch ブロック（システム構成図）。区画を上から下へ重ね、区画の中にカードを左から右へ並べる。"""

    zones: list[ArchZone] = Field(min_length=1)
    nodes: list[ArchNode] = Field(min_length=1)
    links: list[ArchLink] = []
    notes: list[str] = []

    @model_validator(mode="after")
    def check_refs(self) -> "ArchBlock":
        zones = [z.id for z in self.zones]
        nodes = [n.id for n in self.nodes]
        for kind, ids in (("区画", zones), ("カード", nodes)):
            dup = sorted({i for i in ids if ids.count(i) > 1})
            if dup:
                raise ValueError(f"{kind}の id が重複しています: {dup}")
        for n in self.nodes:
            if n.zone is not None and n.zone not in zones:
                raise ValueError(f"{n.id} の zone: {n.zone} がありません（候補: {', '.join(zones)}）")
        for l in self.links:
            for end in (l.from_, l.to):
                if end not in nodes:
                    raise ValueError(f"links の {end} がカードにありません（候補: {', '.join(nodes)}）")
        return self


BLOCK_MODELS: dict[str, type[BaseModel]] = {
    "gantt": GanttBlock,
    "mock": MockBlock,
    "er": ErBlock,
    "usecase": UsecaseBlock,
    "flow": FlowBlock,
    "arch": ArchBlock,
}
