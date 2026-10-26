import { Alert, Group, Loader, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconDownload, IconExternalLink, IconFile, IconFileTypePdf, IconLink, IconPhoto } from "@tabler/icons-react";
import { useState } from "react";
import type { MaterialFile, MaterialLink, ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";
import { canPreview, fileKind, formatSize, hostOf, loadFileBlob } from "../lib/materials";
import { usePrint } from "../lib/print";
import { ICON_STROKE } from "./icons";

// 同じファイルを開き直したときに読み込みをくり返さない（Firestore の読み取り回数を抑える）
const cache = new Map<string, Promise<Blob>>();

function fileIcon(file: MaterialFile) {
  if (file.content_type === "application/pdf") return IconFileTypePdf;
  if (file.content_type.startsWith("image/")) return IconPhoto;
  return IconFile;
}

function Row({
  icon: Icon,
  title,
  note,
  meta,
  action,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  title: string;
  note?: string;
  meta: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <ThemeIcon variant="light" size={40} radius="md">
        <Icon size={20} stroke={ICON_STROKE} />
      </ThemeIcon>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={700}>{title}</Text>
        {note && <Text size="sm" c="dimmed" mt={2}>{note}</Text>}
        <Text size="xs" c="dimmed" mt={4} className="ks-material-meta">{meta}</Text>
      </div>
      {action}
    </>
  );
}

function LinkRow({ link }: { link: MaterialLink }) {
  const print = usePrint();
  // PDF では URL を書き出す（紙に印刷しても辿れるように）
  return (
    <UnstyledButton component="a" href={link.url} target="_blank" rel="noopener noreferrer" className="ks-material">
      <Row
        icon={IconLink}
        title={link.title}
        note={link.note}
        meta={print ? link.url : hostOf(link.url)}
        action={!print && <IconExternalLink size={18} stroke={ICON_STROKE} className="ks-material-action" />}
      />
    </UnstyledButton>
  );
}

function FileRow({ projectId, file, onError }: { projectId: string; file: MaterialFile; onError: (m: string) => void }) {
  const print = usePrint();
  const [busy, setBusy] = useState(false);
  const preview = canPreview(file.content_type);
  const meta = `${fileKind(file)}・${formatSize(file.size)}`;
  if (print) return <div className="ks-material"><Row icon={fileIcon(file)} title={file.title} note={file.note} meta={`${meta}（サイトから開けます）`} /></div>;

  const open = async () => {
    onError("");
    // 読み込みを待ってから開くとポップアップとして止められるので、先にタブだけ開いておく
    const win = preview ? window.open("", "_blank") : null;
    setBusy(true);
    try {
      let blob = cache.get(file.id);
      if (!blob) cache.set(file.id, (blob = loadFileBlob(db, projectId, file)));
      const url = URL.createObjectURL(await blob.catch((e) => { cache.delete(file.id); throw e; }));
      if (win) win.location.href = url;
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <UnstyledButton onClick={open} disabled={busy} className="ks-material" aria-label={`${file.title}を${preview ? "開く" : "保存"}`}>
      <Row
        icon={fileIcon(file)}
        title={file.title}
        note={file.note}
        meta={meta}
        action={
          busy ? (
            <Loader size={16} />
          ) : preview ? (
            <IconExternalLink size={18} stroke={ICON_STROKE} className="ks-material-action" />
          ) : (
            <IconDownload size={18} stroke={ICON_STROKE} className="ks-material-action" />
          )
        }
      />
    </UnstyledButton>
  );
}

export function hasMaterials(project: ProjectRecord): boolean {
  return !!(project.links?.length || project.files?.length);
}

// 補足資料の一覧。表紙と「補足資料」のページで使う
export function MaterialsList({ project, columns = 1 }: { project: ProjectRecord; columns?: number }) {
  const [error, setError] = useState("");
  const items = [
    ...(project.links ?? []).map((l, i) => <LinkRow key={`l${i}`} link={l} />),
    ...(project.files ?? []).map((f) => <FileRow key={f.id} projectId={project.id} file={f} onError={setError} />),
  ];
  return (
    <Stack gap="sm">
      {error && <Alert color="red" title="開けませんでした" onClose={() => setError("")} withCloseButton>{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: columns }} spacing="sm">{items}</SimpleGrid>
    </Stack>
  );
}

// 「補足資料」のページ
export default function MaterialsPage({ project }: { project: ProjectRecord }) {
  return (
    <Paper component="article" withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
      <header className="ks-doc-header">
        <Group justify="space-between" align="baseline" gap="xs">
          <Text className="ks-eyebrow">MATERIALS</Text>
        </Group>
        <Title order={1} mt={4}>補足資料</Title>
      </header>
      {hasMaterials(project) ? (
        <>
          <Text size="sm" c="dimmed" mb="lg">
            提案資料と合わせてご覧いただく画面モックや資料です。リンクと PDF は新しいタブで開き、そのほかのファイルは保存されます。
          </Text>
          <MaterialsList project={project} />
        </>
      ) : (
        <Text size="sm" c="dimmed">補足資料はありません。</Text>
      )}
    </Paper>
  );
}
