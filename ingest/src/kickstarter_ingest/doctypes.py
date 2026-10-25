"""14種のドキュメント定義。キーは Firestore のドキュメントIDになる。

questions は対話モード（空の案件で Claude が1項目ずつ聞く）で使う質問。llms.txt と schema/index.json に出力する。
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class DocType:
    key: str
    filename: str
    format: str  # "markdown" | "yaml"
    title: str
    questions: tuple[str, ...] = ()
    blocks: tuple[str, ...] = ()  # 本文で使う図のブロック（schema/<名前>.json で検証される）


DOC_TYPES: tuple[DocType, ...] = (
    DocType(
        "executive-summary",
        "executive-summary.md",
        "markdown",
        "エグゼクティブサマリー",
        (
            "解決したい背景と課題は何ですか？",
            "提案内容をひとことで言うと何ですか？",
            "期待効果は何ですか？（可能なら現状と目標の数値）",
        ),
    ),
    DocType(
        "personas",
        "personas.md",
        "markdown",
        "ペルソナ / ユースケース",
        (
            "主な利用者は誰ですか？（立場・年代・利用場面）",
            "管理者や運用担当者はいますか？",
            "それぞれの利用者は、このシステムで何をしたいですか？",
        ),
        ("usecase",),
    ),
    DocType(
        "requirements",
        "requirements.md",
        "markdown",
        "要件定義書",
        (
            "このシステムの目的は何ですか？",
            "スコープに含めるもの、含めないものは何ですか？",
            "必要な機能は何ですか？（優先度 Must / Should / Could も）",
            "性能・可用性・セキュリティ・対応端末などの非機能要件はありますか？",
        ),
    ),
    DocType(
        "tech-spec",
        "tech-spec.md",
        "markdown",
        "技術仕様書",
        (
            "技術スタックに希望や制約はありますか？（言語、クラウド、既存システムなど）",
            "連携する外部サービスや既存システムはありますか？",
            "すでに決まっている技術的な決定事項はありますか？",
        ),
    ),
    DocType(
        "screens",
        "screens.md",
        "markdown",
        "画面仕様 / ワイヤーフレーム",
        (
            "主な画面は何がありますか？",
            "各画面に置く項目と操作は何ですか？",
            "PC とスマホのどちらが中心ですか？",
        ),
        ("mock",),
    ),
    DocType(
        "page-flow",
        "page-flow.md",
        "markdown",
        "ページ遷移図",
        (
            "画面同士はどう遷移しますか？（画面仕様から下書きして確認してもよい）",
            "使う場所・端末で画面を分けますか？（例: 現地のタブレット / 事務所のPC）",
        ),
        ("flow",),
    ),
    DocType(
        "er-diagram",
        "er-diagram.md",
        "markdown",
        "ER図",
        (
            "システムで管理するデータ（会員、予約など）は何ですか？",
            "それぞれの主な項目と、データ同士の関係は何ですか？",
        ),
        ("er",),
    ),
    DocType(
        "api",
        "api.yaml",
        "yaml",
        "API仕様",
        ("外部に公開する API や、画面から呼ぶ API は必要ですか？必要なら主なエンドポイントは何ですか？",),
    ),
    DocType(
        "roadmap",
        "roadmap.md",
        "markdown",
        "開発計画書 / ロードマップ",
        (
            "開始日とリリースの希望日はいつですか？",
            "フェーズとマイルストーンは何ですか？",
            "開発体制と担当はどうなりますか？",
        ),
        ("gantt",),
    ),
    DocType(
        "estimate",
        "estimate.yaml",
        "yaml",
        "見積もり",
        (
            "人月単価はいくらですか？",
            "フェーズごとの作業と工数（人月）はどのくらいですか？",
            "見積もりの前提や対象外の費用はありますか？",
        ),
    ),
    DocType(
        "risks",
        "risks.yaml",
        "yaml",
        "リスク管理表",
        ("想定されるリスクは何ですか？（それぞれの発生確率・影響・対策・担当）",),
    ),
    DocType(
        "test-plan",
        "test-plan.md",
        "markdown",
        "テスト計画",
        (
            "テストの範囲と環境はどうしますか？（単体・結合・受入、検証環境）",
            "受入テストで確認したいシナリオは何ですか？",
        ),
    ),
    DocType(
        "glossary",
        "glossary.yaml",
        "yaml",
        "用語集",
        ("業界や社内で使う、説明が必要な用語はありますか？",),
    ),
    DocType(
        "adr",
        "adr.md",
        "markdown",
        "変更履歴 / ADR",
        ("記録しておきたい重要な設計判断と、その理由はありますか？",),
    ),
)
