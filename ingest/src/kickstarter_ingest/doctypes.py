"""14種のドキュメント定義。キーは Firestore のドキュメントIDになる。"""

from dataclasses import dataclass


@dataclass(frozen=True)
class DocType:
    key: str
    filename: str
    format: str  # "markdown" | "yaml"


DOC_TYPES: tuple[DocType, ...] = (
    DocType("executive-summary", "executive-summary.md", "markdown"),
    DocType("personas", "personas.md", "markdown"),
    DocType("requirements", "requirements.md", "markdown"),
    DocType("tech-spec", "tech-spec.md", "markdown"),
    DocType("screens", "screens.md", "markdown"),
    DocType("page-flow", "page-flow.md", "markdown"),
    DocType("er-diagram", "er-diagram.md", "markdown"),
    DocType("api", "api.yaml", "yaml"),
    DocType("roadmap", "roadmap.md", "markdown"),
    DocType("estimate", "estimate.yaml", "yaml"),
    DocType("risks", "risks.yaml", "yaml"),
    DocType("test-plan", "test-plan.md", "markdown"),
    DocType("glossary", "glossary.yaml", "yaml"),
    DocType("adr", "adr.md", "markdown"),
)
