import { Alert, Badge, Card, Group, Loader, SimpleGrid, Text, Title } from "@mantine/core";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import type { ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

const STATUS_COLOR: Record<string, string> = { draft: "gray", proposed: "blue", approved: "green", archived: "dark" };

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
      <Title order={1} mb="lg">案件一覧</Title>
      {error && <Alert color="red">{error}</Alert>}
      {projects === null && !error && <Loader />}
      {projects?.length === 0 && <Text c="dimmed">閲覧できる案件がありません。</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {projects?.map((p) => (
          <Card key={p.id} component={Link} to={`/projects/${p.id}`} withBorder shadow="sm" radius="md">
            <Group justify="space-between" mb="xs">
              <Text fw={700}>{p.name}</Text>
              <Badge color={STATUS_COLOR[p.status] ?? "gray"} variant="light">{p.status}</Badge>
            </Group>
            <Text size="sm" c="dimmed">{p.summary}</Text>
          </Card>
        ))}
      </SimpleGrid>
    </Layout>
  );
}
