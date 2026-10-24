import { Alert, Badge, Button, Card, Group, Loader, Pill, Stack, Text, TextInput, Title } from "@mantine/core";
import { arrayRemove, arrayUnion, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import Layout from "../components/Layout";
import type { ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 案件ID → 閲覧できるメールアドレス
type ViewerMap = Record<string, string[]>;

export default function Admin() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [viewers, setViewers] = useState<ViewerMap>({});
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getDocs(collection(db, "projects")), getDocs(collection(db, "access"))])
      .then(([p, a]) => {
        const map: ViewerMap = {};
        for (const d of a.docs) {
          for (const id of (d.data().projects as string[]) ?? []) (map[id] ??= []).push(d.id);
        }
        setProjects(p.docs.map((d) => d.data() as ProjectRecord).sort((x, y) => x.name.localeCompare(y.name, "ja")));
        setViewers(map);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // サインアップ前のメールにも付与できる。ログインした時点で閲覧できるようになる
  async function update(projectId: string, email: string, grant: boolean) {
    setError("");
    try {
      await setDoc(
        doc(db, "access", email),
        { projects: grant ? arrayUnion(projectId) : arrayRemove(projectId), updatedAt: serverTimestamp() },
        { merge: true },
      );
      setViewers((v) => {
        const rest = (v[projectId] ?? []).filter((e) => e !== email);
        return { ...v, [projectId]: grant ? [...rest, email] : rest };
      });
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Layout>
      <Title order={1} mb="xs">閲覧権限</Title>
      <Text c="dimmed" mb="lg">
        案件ごとに閲覧できるクライアントのメールアドレスを指定します。管理者は指定しなくても全案件を閲覧できます。
      </Text>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {projects === null && !error && <Loader />}
      {projects?.length === 0 && <Text c="dimmed">案件がありません。ingest CLI で投入してください。</Text>}
      <Stack>
        {projects?.map((p) => (
          <ProjectAccess
            key={p.id}
            project={p}
            emails={[...(viewers[p.id] ?? [])].sort()}
            onGrant={(email) => update(p.id, email, true)}
            onRevoke={(email) => update(p.id, email, false)}
          />
        ))}
      </Stack>
    </Layout>
  );
}

function ProjectAccess({ project, emails, onGrant, onRevoke }: {
  project: ProjectRecord;
  emails: string[];
  onGrant: (email: string) => Promise<void>;
  onRevoke: (email: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const email = input.trim().toLowerCase();
  const invalid = email !== "" && !EMAIL_RE.test(email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || invalid) return;
    setBusy(true);
    await onGrant(email);
    setBusy(false);
    setInput("");
  }

  return (
    <Card withBorder radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>{project.name}</Text>
        <Badge variant="light" color="gray" tt="none">{project.id}</Badge>
      </Group>
      {emails.length === 0 ? (
        <Text size="sm" c="dimmed" mb="sm">閲覧できるクライアントはいません。</Text>
      ) : (
        <Pill.Group mb="sm">
          {emails.map((e) => (
            <Pill key={e} size="md" withRemoveButton onRemove={() => onRevoke(e)}>{e}</Pill>
          ))}
        </Pill.Group>
      )}
      <form onSubmit={submit}>
        <Group align="flex-start" gap="xs">
          <TextInput
            placeholder="client@example.com"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            error={invalid && "メールアドレスの形式が不正です"}
            style={{ flex: 1, maxWidth: 360 }}
            aria-label={`${project.name} に閲覧者を追加`}
          />
          <Button type="submit" loading={busy} disabled={!email || invalid}>追加</Button>
        </Group>
      </form>
    </Card>
  );
}
