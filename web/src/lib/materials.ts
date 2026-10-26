import { doc, getDoc, type Bytes, type Firestore } from "firebase/firestore";
import type { MaterialFile } from "./docs";

// 補足資料のページの URL（/projects/:id/:docType の docType として使う。ドキュメント種別とは重ならない）
export const MATERIALS = "materials";

// ファイルの中身は Firestore の 1 ドキュメント（1MiB）に収まらないので、ingest が blobs/{id}-{連番} に分けて置いている。
// 閲覧権限は案件と同じルールで守られる（Spark プランでは Cloud Storage を使わない）
export async function loadFileBlob(db: Firestore, projectId: string, file: MaterialFile): Promise<Blob> {
  const parts = await Promise.all(
    Array.from({ length: file.chunks }, async (_, i) => {
      const snap = await getDoc(doc(db, "projects", projectId, "blobs", `${file.id}-${i}`));
      const data = snap.data()?.data as Bytes | undefined;
      if (!data) throw new Error(`「${file.title}」の一部が見つかりません。原稿をもう一度 push してください`);
      return data.toUint8Array();
    }),
  );
  return new Blob(parts as BlobPart[], { type: file.content_type });
}

// ブラウザで表示できる形式は新しいタブで開き、それ以外は保存する
export function canPreview(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/") || contentType === "text/plain";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 一覧で拡張子の代わりに出す種類の名前
export function fileKind(file: Pick<MaterialFile, "name" | "content_type">): string {
  if (file.content_type === "application/pdf") return "PDF";
  if (file.content_type.startsWith("image/")) return "画像";
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "";
  return ext || "ファイル";
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
