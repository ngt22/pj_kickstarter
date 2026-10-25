import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { load } from "js-yaml";
import type { DocFormat, ProjectRecord } from "./docs";

// ingest の ProjectMeta.id と同じ規則
export const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export type NewProject = Pick<ProjectRecord, "id" | "name" | "summary" | "client" | "proposed_at">;

export type TemplateDoc = { type: string; title: string; order: number; format: DocFormat; body: string };

type SchemaIndex = { docs: { type: string; format: DocFormat; template: string }[] };

// 雛形の原文から title と order を読む（ingest の loader と同じく、本文は原文のまま保存する）
export function parseTemplate(type: string, format: DocFormat, body: string): TemplateDoc {
  let header: unknown;
  if (format === "markdown") {
    const end = body.indexOf("\n---", 3);
    if (!body.startsWith("---") || end === -1) throw new Error(`${type}: front matter がありません`);
    header = load(body.slice(3, end));
  } else {
    header = load(body);
  }
  const { title, order } = (header ?? {}) as { title?: unknown; order?: unknown };
  if (typeof title !== "string" || !Number.isInteger(order)) throw new Error(`${type}: title と order がありません`);
  return { type, title, order: order as number, format, body };
}

// サイトで公開している雛形（ingest の site-assets が書き出す schema/index.json と templates/）を読む。
// CLI の init と同じ雛形なので、ingest 側で雛形を直せばサイトから作る案件にも反映される
export async function loadTemplates(base = "/"): Promise<TemplateDoc[]> {
  const get = async (path: string) => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`${path} を読めません（${res.status}）`);
    return res;
  };
  const index = (await (await get("schema/index.json")).json()) as SchemaIndex;
  return Promise.all(
    index.docs.map(async (d) => parseTemplate(d.type, d.format, await (await get(d.template)).text())),
  );
}

// 案件と原稿をまとめて作る。同じIDの案件があれば上書きせずにエラーにする
export async function createProject(db: Firestore, meta: NewProject, docs: TemplateDoc[]): Promise<void> {
  const ref = doc(db, "projects", meta.id);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new Error(`案件ID「${meta.id}」はすでに使われています`);
    tx.set(ref, { ...meta, status: "draft", version: "", color: "brand", updatedAt: serverTimestamp() });
    for (const d of docs) tx.set(doc(ref, "docs", d.type), { ...d, updatedAt: serverTimestamp() });
  });
}
