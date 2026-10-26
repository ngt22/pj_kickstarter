import { load } from "js-yaml";

export type DocFormat = "markdown" | "yaml";

export type DocRecord = {
  type: string;
  title: string;
  order: number;
  format: DocFormat;
  body: string;
  updatedAt?: { toDate(): Date }; // Firestore の Timestamp
};

export type MaterialLink = { title: string; url: string; note?: string };

// ingest の LoadedFile.record() と同じ形
export type MaterialFile = {
  id: string; // 中身のハッシュ
  title: string;
  note?: string;
  name: string; // 元のファイル名（保存するときの名前）
  content_type: string;
  size: number;
  chunks: number;
};

export type ProjectRecord = {
  id: string;
  name: string;
  summary: string;
  status: string;
  client?: string;
  proposed_at?: string; // YYYY-MM-DD
  version?: string;
  color?: string; // 表紙のキー色（テーマの色の名前）
  links?: MaterialLink[]; // 補足資料のリンク（画面モックなど）
  files?: MaterialFile[]; // 補足資料のファイル。中身は blobs に分けて置く（lib/materials.ts）
  updatedAt?: { toDate(): Date };
};

export const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "gray" },
  proposed: { label: "提案中", color: "brand" },
  approved: { label: "承認済み", color: "green" },
  archived: { label: "アーカイブ", color: "dark" },
};

export function stripFrontMatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  return end === -1 ? text : text.slice(end + 4).replace(/^\n+/, "");
}

export function parseYaml<T>(text: string): T {
  return load(text) as T;
}
