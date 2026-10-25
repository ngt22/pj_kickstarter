"""クライアント向けの表現チェック。

資料はクライアントが読むので、社内のあだ名・原価・書きかけの印などが残っていないかを push 前に探す。
- 管理画面と project.yaml で指定した禁止語、雛形のプレースホルダー（〇〇）: push を止める
- 原価・粗利などの標準の注意語: 警告だけ（「利益率の向上」のようにクライアント側の話として正しく使うこともある）
- 「未定」: 件数だけ表示する（対話モードでは未定のまま先へ進めるため）
"""

import re
from dataclasses import dataclass

from .doctypes import DOC_TYPES
from .loader import LoadResult
from .models import ProjectMeta

# 標準の注意語。英字は大文字小文字を区別しない
CAUTION_TERMS = ["原価", "粗利", "利益率", "仕入", "無料枠", "TODO", "TBD", "FIXME"]
PLACEHOLDERS = ["〇〇", "○○"]
UNDECIDED = "未定"

HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
TOP_KEY_RE = re.compile(r"^([A-Za-z_]\w*):")


@dataclass
class Finding:
    file: str
    line: int
    term: str
    blocking: bool

    def __str__(self) -> str:
        return f"{self.file}:{self.line}: 「{self.term}」"


@dataclass
class WordingReport:
    findings: list[Finding]
    undecided: int

    @property
    def blocking(self) -> list[Finding]:
        return [f for f in self.findings if f.blocking]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if not f.blocking]


def _visible_lines(text: str, yaml: bool) -> list[tuple[int, str]]:
    """クライアントに見えない部分（コメント）を除いた行を、行番号つきで返す。"""
    if not yaml:
        # 改行を残して消し、行番号をずらさない
        text = HTML_COMMENT_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    lines = []
    for no, line in enumerate(text.splitlines(), 1):
        if yaml:
            if line.lstrip().startswith("#"):
                continue
            line = re.sub(r"\s#\s.*$", "", line)
        lines.append((no, line))
    return lines


def check_wording(result: LoadResult, forbidden_terms: list[str] = ()) -> WordingReport:
    """原稿から禁止語などを探す。forbidden_terms はサイトの設定（管理画面）の禁止語。"""
    filenames = {dt.key: dt.filename for dt in DOC_TYPES}
    blocking_terms = [t for t in dict.fromkeys([*forbidden_terms, *(result.meta.forbidden_terms if result.meta else [])]) if t]
    files = [(filenames[d.type], d.body, d.format == "yaml") for d in result.docs]
    if result.meta_text is not None:
        files.insert(0, ("project.yaml", result.meta_text, True))

    findings: list[Finding] = []
    undecided = 0
    for name, text, is_yaml in files:
        top_key = ""
        for no, line in _visible_lines(text, is_yaml):
            if m := TOP_KEY_RE.match(line):
                top_key = m.group(1)
            # project.yaml の禁止語や閲覧者の一覧はサイトに送らないので対象外
            if name == "project.yaml" and top_key in ProjectMeta.PRIVATE_FIELDS:
                continue
            lower = line.lower()
            for t in [*blocking_terms, *PLACEHOLDERS]:
                if t.lower() in lower:
                    findings.append(Finding(name, no, t, True))
            for t in CAUTION_TERMS:
                if t.lower() in lower:
                    findings.append(Finding(name, no, t, False))
            undecided += line.count(UNDECIDED)
    return WordingReport(findings, undecided)

