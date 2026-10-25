import { Alert, Chip, Drawer, Group, ScrollArea, SegmentedControl, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconNote } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import EmptyState from "../EmptyState";
import AnnotationCard from "./AnnotationCard";
import { useAnnotations } from "./AnnotationContext";

export const LIST_WIDTH = 400;

type StatusFilter = "open" | "close" | "all";

// 付箋の一覧。ページを見ながら使えるように、背景を暗くせずスクロールも止めない
export default function AnnotationList() {
  const { annotations, docType, listOpen, setListOpen, jumpTo, error } = useAnnotations();
  const narrow = useMediaQuery("(max-width: 48em)");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [scope, setScope] = useState<"page" | "all">("all");
  const [tags, setTags] = useState<string[]>([]);

  const allTags = useMemo(() => [...new Set(annotations.flatMap((a) => a.tags))].sort(), [annotations]);
  const shown = annotations.filter(
    (a) =>
      (status === "all" || a.status === status) &&
      (scope === "all" || a.docType === docType) &&
      tags.every((t) => a.tags.includes(t)),
  );
  const count = (s: StatusFilter) => annotations.filter((a) => (s === "all" || a.status === s) && (scope === "all" || a.docType === docType)).length;

  return (
    <Drawer
      opened={listOpen}
      onClose={() => setListOpen(false)}
      position="right"
      size={LIST_WIDTH}
      withOverlay={false}
      lockScroll={false}
      trapFocus={false}
      title={<Text fw={700}>付箋の一覧</Text>}
      scrollAreaComponent={ScrollArea.Autosize}
      classNames={{ content: "ks-annot-drawer" }}
    >
      <Stack gap="sm">
        <SegmentedControl
          size="xs"
          fullWidth
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          data={[
            { value: "open", label: `open (${count("open")})` },
            { value: "close", label: `close (${count("close")})` },
            { value: "all", label: `すべて (${count("all")})` },
          ]}
        />
        <SegmentedControl
          size="xs"
          fullWidth
          value={scope}
          onChange={(v) => setScope(v as "page" | "all")}
          data={[
            { value: "all", label: "すべてのページ" },
            { value: "page", label: "このページ" },
          ]}
        />
        {allTags.length > 0 && (
          <Chip.Group multiple value={tags} onChange={setTags}>
            <Group gap={6}>
              {allTags.map((t) => (
                <Chip key={t} value={t} size="xs" variant="outline">#{t}</Chip>
              ))}
            </Group>
          </Chip.Group>
        )}
        {error && <Alert color="red" title="付箋を読み込めませんでした">{error}</Alert>}
        {shown.length === 0 ? (
          <EmptyState icon={IconNote} title="付箋はありません">
            右上の「付箋」で付箋モードにして、ペン・囲み・引出線で書き込んでから保存してください。
          </EmptyState>
        ) : (
          shown.map((a) => (
            <AnnotationCard
              key={a.id}
              a={a}
              showPage
              onJump={() => {
                jumpTo(a);
                if (narrow) setListOpen(false);
              }}
            />
          ))
        )}
      </Stack>
    </Drawer>
  );
}
