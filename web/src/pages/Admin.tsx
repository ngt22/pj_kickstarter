import { Alert, Badge, Button, Card, Code, Group, Loader, Modal, Pill, Stack, Text, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconTrash } from "@tabler/icons-react";
import { arrayRemove, arrayUnion, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, type FormEvent } from "react";
import Layout from "../components/Layout";
import { deleteProject } from "../lib/deleteProject";
import type { ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 案件ID → 閲覧できるメールアドレス
type ViewerMap = Record<string, string[]>;

export default function Admin() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [viewers, setViewers] = useState<ViewerMap>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  async function remove(project: ProjectRecord) {
    setError("");
    setNotice("");
    try {
      const result = await deleteProject(db, project.id);
      setProjects((ps) => ps?.filter((p) => p.id !== project.id) ?? null);
      setViewers(({ [project.id]: _, ...rest }) => rest);
      setNotice(`「${project.name}」を削除しました（ドキュメント ${result.docs} 件、閲覧者 ${result.viewers} 人の権限を解除）。`);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  return (
    <Layout>
      <Title order={1} mb="xs">案件の管理</Title>
      <Text c="dimmed" mb="lg">
        案件ごとに閲覧できるクライアントのメールアドレスを指定します。管理者は指定しなくても全案件を閲覧できます。不要になった案件はここから削除できます。
      </Text>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {notice && <Alert color="green" mb="md" withCloseButton onClose={() => setNotice("")}>{notice}</Alert>}
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
            onDelete={() => remove(p)}
          />
        ))}
      </Stack>
    </Layout>
  );
}

function ProjectAccess({ project, emails, onGrant, onRevoke, onDelete }: {
  project: ProjectRecord;
  emails: string[];
  onGrant: (email: string) => Promise<void>;
  onRevoke: (email: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [deleting, { open: openDelete, close: closeDelete }] = useDisclosure(false);
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
    <Card>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text fw={700}>{project.name}</Text>
          <Badge variant="light" color="gray" tt="none">{project.id}</Badge>
        </Group>
        <Button
          variant="subtle"
          color="red"
          size="xs"
          leftSection={<IconTrash size={14} stroke={1.6} />}
          onClick={openDelete}
        >
          削除
        </Button>
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
      <DeleteProjectModal
        project={project}
        viewers={emails.length}
        opened={deleting}
        onClose={closeDelete}
        onDelete={onDelete}
      />
    </Card>
  );
}

// 取り消せない操作なので、案件IDを入力してもらってから削除する
function DeleteProjectModal({ project, viewers, opened, onClose, onDelete }: {
  project: ProjectRecord;
  viewers: number;
  opened: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const matched = input.trim() === project.id;

  function close() {
    if (busy) return;
    setInput("");
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matched) return;
    setBusy(true);
    try {
      await onDelete(); // 成功するとカードごと消えるので、閉じる処理はいらない
    } catch {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={700}>案件を削除</Text>} centered>
      <form onSubmit={submit}>
        <Stack>
          <Alert color="red" variant="light">
            「{project.name}」の原稿をすべて削除し、閲覧者 {viewers} 人の閲覧権限も解除します。この操作は取り消せません。
          </Alert>
          <Text size="sm">
            元の原稿ファイルがあれば、ingest CLI でもう一度 push すると復元できます。
          </Text>
          <TextInput
            label={<>確認のため案件ID <Code>{project.id}</Code> を入力してください</>}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            autoComplete="off"
            data-autofocus
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close} disabled={busy}>キャンセル</Button>
            <Button type="submit" color="red" loading={busy} disabled={!matched}>削除する</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
