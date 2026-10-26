import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import type { DocRecord, ProjectRecord } from "./docs";
import { sortDocs } from "./doctypes";
import { db } from "./firebase";

// 案件と、その資料を並び順どおりに読む
export async function loadProject(projectId: string): Promise<{ project: ProjectRecord; docs: DocRecord[] }> {
  const ref = doc(db, "projects", projectId);
  const [p, d] = await Promise.all([getDoc(ref), getDocs(collection(ref, "docs"))]);
  return {
    project: { ...(p.data() as ProjectRecord), id: projectId },
    docs: sortDocs(d.docs.map((x) => x.data() as DocRecord)),
  };
}
