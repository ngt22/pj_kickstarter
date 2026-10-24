import { Alert, Badge, Card, Group, Loader, SimpleGrid, Text, Title } from "@mantine/core";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import type { ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

const STATUS_COLOR: Record<string, string> = { draft: "gray", proposed: "brand", approved: "green", archived: "dark" };

// 管理者は全件を取得する。クライアントは access/{自分のメール} にある案件を1件ずつ取得する
// （全件クエリはルールで拒否されるため）
async function loadProjects(email: string, isAdmin: boolean): Promise<ProjectRecord[]> {
  if (isAdmin) {
    const snap = await getDocs(collection(db, "projects"));
    return snap.docs.map((d) => d.data() as ProjectRecord);
  }
  const access = await getDoc(doc(db, "access", email.toLowerCase()));
  const ids: string[] = access.data()?.projects ?? [];
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, "projects", id))));
  return snaps.filter((s) => s.exists()).map((s) => s.data() as ProjectRecord);
}

export default function ProjectList() {
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.email) return;
    loadProjects(user.email, isAdmin)
      .then(setProjects)
      .catch((e) => setError(String(e)));
  }, [user, isAdmin]);

  return (
    <Layout>
      <Title order={1} mb="lg">案件一覧</Title>
      {error && <Alert color="red">{error}</Alert>}
      {projects === null && !error && <Loader />}
      {projects?.length === 0 && <Text c="dimmed">閲覧できる案件がありません。</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {projects?.map((p) => (
          <Card key={p.id} component={Link} to={`/projects/${p.id}`} className="ks-card-link">
            <Group justify="space-between" mb="xs">
              <Text fw={700}>{p.name}</Text>
              <Badge color={STATUS_COLOR[p.status] ?? "gray"}>{p.status}</Badge>
            </Group>
            <Text size="sm" c="dimmed">{p.summary}</Text>
          </Card>
        ))}
      </SimpleGrid>
    </Layout>
  );
}
