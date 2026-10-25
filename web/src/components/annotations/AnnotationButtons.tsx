import { ActionIcon, Button, Indicator, Tooltip } from "@mantine/core";
import { IconListDetails, IconNote } from "@tabler/icons-react";
import { ICON_STROKE } from "../icons";
import { useAnnotations } from "./AnnotationContext";

// ヘッダー右上の「付箋」ボタン（付箋モードの切り替え）と一覧ボタン（open の数を出す）
export default function AnnotationButtons() {
  const { active, setActive, listOpen, setListOpen, annotations } = useAnnotations();
  const open = annotations.filter((a) => a.status === "open").length;
  const label = active ? "付箋モードを終える" : "付箋モード：ペン・囲み・引出線で書き込む";
  return (
    <>
      <Tooltip label={label}>
        <Button
          size="xs"
          variant={active ? "filled" : "light"}
          leftSection={<IconNote size={16} stroke={ICON_STROKE} />}
          onClick={() => setActive(!active)}
          aria-pressed={active}
          visibleFrom="xs"
        >
          付箋
        </Button>
      </Tooltip>
      {/* 幅の狭い画面ではアイコンだけにする */}
      <ActionIcon
        size="md"
        variant={active ? "filled" : "light"}
        onClick={() => setActive(!active)}
        aria-pressed={active}
        aria-label="付箋"
        hiddenFrom="xs"
      >
        <IconNote size={18} stroke={ICON_STROKE} />
      </ActionIcon>
      <Indicator label={open} size={16} disabled={open === 0} color="red" offset={4}>
        <Tooltip label="付箋の一覧">
          <ActionIcon
            variant={listOpen ? "filled" : "default"}
            size="md"
            onClick={() => setListOpen(!listOpen)}
            aria-label="付箋の一覧"
            aria-pressed={listOpen}
          >
            <IconListDetails size={18} stroke={ICON_STROKE} />
          </ActionIcon>
        </Tooltip>
      </Indicator>
    </>
  );
}
