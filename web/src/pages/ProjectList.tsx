import { Alert, Badge, Card, Group, SimpleGrid, Skeleton, Text, Title } from "@mantine/core";
import { IconFolderOpen } from "@tabler/icons-react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import { STATUS, type ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";


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

  const dateFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <Layout>
      <Group justify="space-between" align="flex-end" mb="lg">
        <div>
          <Text className="ks-eyebrow">PROJECTS</Text>
          <Title order={1} mt={4}>案件一覧</Title>
        </div>
        {projects && projects.length > 0 && <Text size="sm" c="dimmed">{projects.length} 件</Text>}
      </Group>
      {error && <Alert color="red" title="読み込めませんでした" mb="md">{error}</Alert>}
      {projects?.length === 0 && (
        <EmptyState icon={IconFolderOpen} title="閲覧できる案件がありません">
          {isAdmin
            ? "ingest CLI で案件を push すると、ここに表示されます。"
            : "担当者から閲覧権限が付与されると、ここに表示されます。"}
        </EmptyState>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {projects === null && !error &&
          [0, 1, 2].map((n) => (
            <Card key={n}>
              <Skeleton h={10} w={90} mb="sm" />
              <Skeleton h={20} w="70%" mb="md" />
              <Skeleton h={12} mb={6} />
              <Skeleton h={12} w="80%" />
            </Card>
          ))}
        {projects?.map((p) => {
          const status = STATUS[p.status] ?? { label: p.status, color: "gray" };
          return (
            <Card
              key={p.id}
              component={Link}
              to={`/projects/${p.id}`}
              className="ks-card-link ks-project-card"
              style={{ "--ks-accent": `var(--mantine-color-${p.color ?? "brand"}-filled)` } as React.CSSProperties}
            >
              <Text size="xs" c="dimmed" fw={500} truncate>{p.client || "クライアント未設定"}</Text>
              <Text fw={700} size="lg" mt={4} lh={1.5}>{p.name}</Text>
              <Text size="sm" c="dimmed" mt="xs" lineClamp={2}>{p.summary}</Text>
              <Group justify="space-between" mt="lg" pt="sm" className="ks-project-card-foot">
                <Badge color={status.color}>{status.label}</Badge>
                <Text size="xs" c="dimmed">
                  {p.proposed_at
                    ? `提案日 ${dateFmt.format(new Date(p.proposed_at))}`
                    : p.updatedAt && `更新 ${dateFmt.format(p.updatedAt.toDate())}`}
                </Text>
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </Layout>
  );
}
