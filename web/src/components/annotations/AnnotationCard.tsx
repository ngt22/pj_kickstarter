import { ActionIcon, Badge, Button, Group, Paper, Stack, TagsInput, Text, Textarea, Tooltip, UnstyledButton } from "@mantine/core";
import { IconCircleCheck, IconCircleDot, IconEdit, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { annotationText, deleteAnnotation, updateAnnotation, type Annotation } from "../../lib/annotations";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { ICON_STROKE } from "../icons";
import { useAnnotations } from "./AnnotationContext";

const timeFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function StatusBadge({ status }: { status: Annotation["status"] }) {
  return (
    <Badge size="sm" color={status === "open" ? "red" : "gray"} leftSection={status === "open" ? <IconCircleDot size={12} /> : <IconCircleCheck size={12} />}>
      {status}
    </Badge>
  );
}

// 付箋 1 枚の内容。一覧と、ページ上のピンを押したときの吹き出しで使う
export default function AnnotationCard({ a, onJump, showPage }: { a: Annotation; onJump?: () => void; showPage?: boolean }) {
  const { projectId, pageTitles } = useAnnotations();
  const { user, isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(a.tags);
  const [comment, setComment] = useState(a.comment);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = user?.uid === a.authorUid;
  const canEdit = mine || isAdmin;
  const text = annotationText(a);

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      {showPage && <Text size="xs" c="dimmed" mb={2}>{pageTitles[a.docType] ?? a.docType}</Text>}
      <Text size="sm" lh={1.6} lineClamp={onJump ? 4 : undefined} className="ks-annot-text">
        {text || <Text span c="dimmed" size="sm">（手書きのみ）</Text>}
      </Text>
    </>
  );

  return (
    <Paper withBorder radius="md" p="sm" className="ks-annot-card" data-status={a.status}>
      <Group justify="space-between" gap="xs" mb={6} wrap="nowrap">
        <StatusBadge status={a.status} />
        <Text size="xs" c="dimmed" truncate>
          {a.authorName} · {a.createdAt ? timeFmt.format(a.createdAt.toDate()) : "保存中…"}
        </Text>
      </Group>
      {onJump ? (
        <UnstyledButton onClick={onJump} w="100%" className="ks-annot-jump" aria-label="この箇所へ移動">
          {body}
        </UnstyledButton>
      ) : (
        body
      )}
      {editing ? (
        <Stack gap="xs" mt="xs">
          <TagsInput label="ハッシュタグ" size="xs" value={tags} onChange={setTags} placeholder="入力して Enter" clearable />
          <Textarea label="補足" size="xs" autosize minRows={2} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setEditing(false)}>やめる</Button>
            <Button
              size="xs"
              loading={busy}
              onClick={() => run(async () => {
                await updateAnnotation(db, projectId, a.id, { tags, comment });
                setEditing(false);
              })}
            >
              保存
            </Button>
          </Group>
        </Stack>
      ) : (
        <Group justify="space-between" gap="xs" mt={6} wrap="nowrap" align="flex-end">
          <Group gap={4}>
            {a.tags.map((t) => (
              <Badge key={t} size="sm" color="brand" variant="outline">#{t}</Badge>
            ))}
          </Group>
          {canEdit && (
            <Group gap={2} wrap="nowrap">
              <Tooltip label={a.status === "open" ? "close にする" : "open に戻す"}>
                <ActionIcon
                  variant="subtle"
                  color={a.status === "open" ? "green" : "gray"}
                  loading={busy}
                  onClick={() => run(() => updateAnnotation(db, projectId, a.id, { status: a.status === "open" ? "close" : "open" }))}
                  aria-label={a.status === "open" ? "close にする" : "open に戻す"}
                >
                  {a.status === "open" ? <IconCircleCheck size={18} stroke={ICON_STROKE} /> : <IconCircleDot size={18} stroke={ICON_STROKE} />}
                </ActionIcon>
              </Tooltip>
              <Tooltip label="ハッシュタグ・補足を編集">
                <ActionIcon variant="subtle" color="gray" onClick={() => { setTags(a.tags); setComment(a.comment); setEditing(true); }} aria-label="編集">
                  <IconEdit size={18} stroke={ICON_STROKE} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="削除">
                <ActionIcon variant="subtle" color="red" onClick={() => setConfirming(true)} aria-label="削除">
                  <IconTrash size={18} stroke={ICON_STROKE} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>
      )}
      {confirming && (
        <Group justify="flex-end" gap="xs" mt="xs">
          <Text size="xs" c="red" mr="auto">この付箋を削除しますか？元に戻せません</Text>
          <Button size="xs" variant="default" onClick={() => setConfirming(false)}>やめる</Button>
          <Button size="xs" color="red" loading={busy} onClick={() => run(() => deleteAnnotation(db, projectId, a.id))}>削除</Button>
        </Group>
      )}
      {error && <Text size="xs" c="red" mt={4}>{error}</Text>}
    </Paper>
  );
}
