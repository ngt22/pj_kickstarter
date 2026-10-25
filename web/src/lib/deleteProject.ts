import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

// 1 回のバッチに入れられる書き込みの上限
const BATCH_LIMIT = 500;

// 案件を破棄する：原稿（docs）、閲覧権限（access の projects から外す）、案件本体の順に消す。
// Spark プランで Cloud Functions が使えないので、管理者のブラウザから消す（ルールで管理者だけに許可）。
// 案件本体は最後に消すので、途中で失敗しても一覧に残り、もう一度実行すれば消し切れる。
export async function deleteProject(db: Firestore, projectId: string): Promise<{ docs: number; viewers: number }> {
  const [docs, viewers] = await Promise.all([
    getDocs(collection(db, "projects", projectId, "docs")),
    getDocs(query(collection(db, "access"), where("projects", "array-contains", projectId))),
  ]);

  const writes = [
    ...docs.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)),
    ...viewers.docs.map((d) => (b: WriteBatch) =>
      b.update(d.ref, { projects: arrayRemove(projectId), updatedAt: serverTimestamp() })),
  ];
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }

  await deleteDoc(doc(db, "projects", projectId));
  return { docs: docs.size, viewers: viewers.size };
}
