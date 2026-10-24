import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import type { ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

export default function ProjectList() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.email) return;
    // ルールが members に自分のメールを含む案件しか許可しないため、クエリも同じ条件にする
    const q = query(collection(db, "projects"), where("members", "array-contains", user.email.toLowerCase()));
    getDocs(q)
      .then((snap) => setProjects(snap.docs.map((d) => d.data() as ProjectRecord)))
      .catch((e) => setError(String(e)));
  }, [user]);

  return (
    <Layout>
      <h1>案件一覧</h1>
      {error && <p className="error">{error}</p>}
      {projects === null && !error && <p>読み込み中…</p>}
      {projects?.length === 0 && <p className="muted">閲覧できる案件がありません。</p>}
      <div className="grid">
        {projects?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card project">
            <h2>{p.name}</h2>
            <p>{p.summary}</p>
            <span className={`badge ${p.status}`}>{p.status}</span>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
