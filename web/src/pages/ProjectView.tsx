import { Alert, Box, Loader, NavLink, Text } from "@mantine/core";
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

  const i = docs.findIndex((d) => d.type === docType);
  const current = docs[i];
  const sidebar = (
    <>
      <Box px="sm" pb="md" mb="xs" className="ks-nav-head">
        <Text className="ks-eyebrow">提案資料</Text>
        <Text fw={700} lh={1.5} mt={2}>{project.name}</Text>
      </Box>
      {docs.map((d, n) => (
        <NavLink
          key={d.type}
          component={Link}
          to={`/projects/${projectId}/${d.type}`}
          leftSection={<span className="ks-nav-num">{String(n + 1).padStart(2, "0")}</span>}
          label={d.title}
          active={d.type === docType}
        />
      ))}
    </>
  );

  return (
    <Layout sidebar={sidebar}>
      {current ? (
        <DocView
          doc={current}
          index={i}
          total={docs.length}
          prev={docs[i - 1]}
          next={docs[i + 1]}
          basePath={`/projects/${projectId}`}
        />
      ) : (
        <Text c="dimmed">ドキュメントが見つかりません。</Text>
      )}
    </Layout>
  );
}
