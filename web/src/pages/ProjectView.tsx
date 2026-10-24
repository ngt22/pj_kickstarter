import { Alert, Loader, NavLink, Text } from "@mantine/core";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import DocView from "../components/DocView";
import Layout from "../components/Layout";
import type { DocRecord, ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

export default function ProjectView() {
  const { projectId = "", docType } = useParams();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    const ref = doc(db, "projects", projectId);
    Promise.all([getDoc(ref), getDocs(collection(ref, "docs"))])
      .then(([p, d]) => {
        setProject(p.data() as ProjectRecord);
        setDocs(d.docs.map((x) => x.data() as DocRecord).sort((a, b) => a.order - b.order));
      })
      .catch((e) => setError(String(e)));
  }, [projectId]);

  if (error) return <Layout><Alert color="red">{error}</Alert></Layout>;
  if (!docs || !project) return <Layout><Loader /></Layout>;
  if (!docType && docs.length > 0) return <Navigate to={`/projects/${projectId}/${docs[0].type}`} replace />;

  const current = docs.find((d) => d.type === docType);
  const sidebar = (
    <>
      <Text fw={700} px="sm" pb="xs">{project.name}</Text>
      {docs.map((d, i) => (
        <NavLink
          key={d.type}
          component={Link}
          to={`/projects/${projectId}/${d.type}`}
          label={`${i + 1}. ${d.title}`}
          active={d.type === docType}
        />
      ))}
    </>
  );

  return (
    <Layout sidebar={sidebar}>
      {current ? <DocView doc={current} /> : <Text c="dimmed">ドキュメントが見つかりません。</Text>}
    </Layout>
  );
}
