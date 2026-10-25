import { Alert, Button, Group, Modal, Stack, TagsInput, Text, Textarea } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { addAnnotation, annotationText, MAX_ITEMS } from "../../lib/annotations";
import { useAuth } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { useAnnotations } from "./AnnotationContext";
import type { Draft } from "./AnnotationLayer";

// 書きかけを 1 枚の付箋として保存する。ユーザー名とタイムスタンプは自動で付き、状態は open で始まる
export default function SaveAnnotationModal({
  opened,
  onClose,
  draft,
  width,
  onSaved,
}: {
  opened: boolean;
  onClose(): void;
  draft: Draft;
  width: number;
  onSaved(): void;
}) {
  const { projectId, docType, annotations } = useAnnotations();
  const { user } = useAuth();
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const knownTags = useMemo(() => [...new Set(annotations.flatMap((a) => a.tags))].sort(), [annotations]);
  const text = annotationText({ items: draft.items, comment: "" });

  useEffect(() => {
    if (opened) setError("");
  }, [opened]);

  const save = async () => {
    if (!user || !draft.anchor) return;
    setBusy(true);
    setError("");
    try {
      await addAnnotation(db, projectId, {
        docType,
        authorUid: user.uid,
        authorName: user.displayName || user.email || "",
        authorEmail: (user.email ?? "").toLowerCase(),
        items: draft.items,
        comment,
        tags,
        anchor: draft.anchor,
        width,
      });
      setTags([]);
      setComment("");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>付箋を保存</Text>}>
      <Stack gap="sm">
        <Text size="sm" c={text ? undefined : "dimmed"}>{text || "囲みに文字が入っていません（手書きだけの付箋になります）"}</Text>
        <TagsInput
          label="ハッシュタグ"
          description="自由に入力して Enter。# は付けなくてもかまいません"
          placeholder="例：文言 / 要確認"
          data={knownTags}
          value={tags}
          onChange={setTags}
          clearable
        />
        <Textarea label="補足" autosize minRows={2} value={comment} onChange={(e) => setComment(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">
          {user?.displayName || user?.email} の名前と保存した時刻が付き、状態は open で登録されます。
        </Text>
        {draft.items.length > MAX_ITEMS && (
          <Alert color="red">書き込みが多すぎます（{draft.items.length} / {MAX_ITEMS} ストローク）。何枚かに分けて保存してください。</Alert>
        )}
        {error && <Alert color="red" title="保存できませんでした">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>戻る</Button>
          <Button loading={busy} onClick={save} disabled={draft.items.length === 0 || draft.items.length > MAX_ITEMS}>保存</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
