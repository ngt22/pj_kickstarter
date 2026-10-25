import { Alert, Anchor, Badge, Button, Card, Code, Group, Loader, Modal, Pill, Stack, Text, TextInput, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { arrayRemove, arrayUnion, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { createProject, loadTemplates, PROJECT_ID_RE, type NewProject } from "../lib/createProject";
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
  const [notice, setNotice] = useState<ReactNode>(null);
  const [creating, { open: openCreate, close: closeCreate }] = useDisclosure(false);

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
    setNotice(null);
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

  // 雛形はサイトで公開しているものを読む。失敗したらモーダルの中でエラーを出す
  async function create(meta: NewProject) {
    const docs = await loadTemplates();
    await createProject(db, meta, docs);
    setProjects((ps) => [...(ps ?? []), { ...meta, status: "draft" }].sort((x, y) => x.name.localeCompare(y.name, "ja")));
    setError("");
    setNotice(
      <>
        「{meta.name}」を作成しました（雛形のドキュメント {docs.length} 件）。{" "}
        <Anchor component={Link} to={`/projects/${meta.id}`}>案件を開く</Anchor>
      </>,
    );
  }

  return (
    <Layout>
      <Group justify="space-between" align="flex-start" mb="xs">
        <Title order={1}>案件の管理</Title>
        <Button leftSection={<IconPlus size={16} stroke={1.6} />} onClick={openCreate} disabled={projects === null}>
          新規案件
        </Button>
      </Group>
      <Text c="dimmed" mb="lg">
        案件ごとに閲覧できるクライアントのメールアドレスを指定します。管理者は指定しなくても全案件を閲覧できます。新しい案件の作成や、不要になった案件の削除もここで行います。
      </Text>
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {notice && <Alert color="green" mb="md" withCloseButton onClose={() => setNotice(null)}>{notice}</Alert>}
      {projects === null && !error && <Loader />}
      {projects?.length === 0 && <Text c="dimmed">案件がありません。「新規案件」から作成するか、ingest CLI で投入してください。</Text>}
      <NewProjectModal
        opened={creating}
        onClose={closeCreate}
        onCreate={create}
        usedIds={new Set(projects?.map((p) => p.id))}
      />
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

const EMPTY: NewProject = { id: "", name: "", summary: "", client: "", proposed_at: "" };

// 14種の雛形（記入例）を入れた案件を作る。CLI の init と同じ雛形
function NewProjectModal({ opened, onClose, onCreate, usedIds }: {
  opened: boolean;
  onClose: () => void;
  onCreate: (meta: NewProject) => Promise<void>;
  usedIds: Set<string>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = { ...form, id: form.id.trim(), name: form.name.trim() };
  const idError = meta.id === "" ? "" : !PROJECT_ID_RE.test(meta.id)
    ? "英小文字・数字・ハイフンで入力してください（先頭はハイフン以外）"
    : usedIds.has(meta.id) ? "この案件IDはすでに使われています" : "";
  const field = (key: keyof NewProject) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.currentTarget.value }),
  });

  function close() {
    if (busy) return;
    setForm(EMPTY);
    setError("");
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!meta.id || !meta.name || idError) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(meta);
      setBusy(false);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={700}>新規案件</Text>} centered>
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm" c="dimmed">
            14種のドキュメントの雛形（記入例）を入れて作成します。中身は Claude との対話や ingest CLI の push で書き換えてください。
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="案件ID"
            description="URL とフォルダ名に使います。あとから変更できません"
            placeholder="reservation-app"
            required
            error={idError}
            autoComplete="off"
            data-autofocus
            {...field("id")}
          />
          <TextInput label="案件名" placeholder="予約管理システム" required {...field("name")} />
          <TextInput label="概要" description="一覧と表紙に表示します" {...field("summary")} />
          <TextInput label="クライアント" placeholder="〇〇株式会社 様" {...field("client")} />
          <TextInput label="提案日" type="date" {...field("proposed_at")} />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close} disabled={busy}>キャンセル</Button>
            <Button type="submit" loading={busy} disabled={!meta.id || !meta.name || !!idError}>作成する</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
