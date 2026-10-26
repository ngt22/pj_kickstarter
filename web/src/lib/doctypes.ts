import type { DocRecord } from "./docs";

// 資料の部と並び順。ingest の doctypes.py（PARTS と DOC_TYPES の順）と同じにする（ingest のテストで照合する）。
// 並び順は Firestore の order ではなく種類で決めるので、古い原稿の案件も push し直さずにこの順で並ぶ
export const PARTS = [
  { key: "overview", title: "第1部 提案の概要" },
  { key: "requirements", title: "第2部 要件" },
  { key: "design", title: "第3部 設計" },
  { key: "process", title: "第4部 進め方" },
  { key: "cost", title: "第5部 費用" },
  { key: "appendix", title: "付録" },
] as const;

export const DOC_PARTS: Record<string, string> = {
  "executive-summary": "overview",
  requirements: "requirements",
  personas: "requirements",
  "tech-spec": "design",
  "page-flow": "design",
  screens: "design",
  "er-diagram": "design",
  api: "design",
  roadmap: "process",
  team: "process",
  "test-plan": "process",
  operations: "process",
  risks: "process",
  estimate: "cost",
  glossary: "appendix",
  adr: "appendix",
};

// 資料の種類が属する部の見出し（知らない種類は空）
export function partTitle(type: string): string {
  return PARTS.find((p) => p.key === DOC_PARTS[type])?.title ?? "";
}

const RANK = Object.fromEntries(Object.keys(DOC_PARTS).map((type, i) => [type, i]));

// 種類の順に並べる。知らない種類は最後に、保存されている order の順で
export function sortDocs<T extends Pick<DocRecord, "type" | "order">>(docs: T[]): T[] {
  const rank = (d: T) => RANK[d.type] ?? Object.keys(RANK).length;
  return [...docs].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

export type PartGroup<T> = { key: string; title: string; docs: { doc: T; index: number }[] };

// 並べた資料を部ごとにまとめる。index は全体の通し番号（0 から）。資料のない部は出さない
export function groupByPart<T extends Pick<DocRecord, "type">>(docs: T[]): PartGroup<T>[] {
  const groups: PartGroup<T>[] = [];
  docs.forEach((doc, index) => {
    const part = PARTS.find((p) => p.key === DOC_PARTS[doc.type]) ?? { key: "other", title: "その他" };
    const last = groups[groups.length - 1];
    if (last?.key === part.key) last.docs.push({ doc, index });
    else groups.push({ key: part.key, title: part.title, docs: [{ doc, index }] });
  });
  return groups;
}
