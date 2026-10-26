import { ActionIcon, Button, CopyButton, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { formatForPrompt, type Annotation } from "../../lib/annotations";
import { ICON_STROKE } from "../icons";
import { useExportContext } from "./AnnotationContext";

// 付箋を、LLM のプロンプトにそのまま貼れる Markdown でクリップボードにコピーする。
// list が 1 枚なら付箋のアイコン、複数なら一覧の上のボタンとして出す
export default function CopyPromptButton({ list, compact }: { list: Annotation[]; compact?: boolean }) {
  const ctx = useExportContext();
  const text = list.length ? formatForPrompt(list, ctx) : "";
  return (
    <CopyButton value={text} timeout={2000}>
      {({ copied, copy }) =>
        compact ? (
          <Tooltip label={copied ? "コピーしました" : "LLM 向けにコピー"}>
            <ActionIcon variant="subtle" color={copied ? "green" : "gray"} onClick={copy} aria-label="LLM 向けにコピー">
              {copied ? <IconCheck size={18} stroke={ICON_STROKE} /> : <IconCopy size={18} stroke={ICON_STROKE} />}
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button
            size="xs"
            variant="light"
            color={copied ? "green" : "brand"}
            fullWidth
            disabled={list.length === 0}
            leftSection={copied ? <IconCheck size={16} stroke={ICON_STROKE} /> : <IconCopy size={16} stroke={ICON_STROKE} />}
            onClick={copy}
          >
            {copied ? "コピーしました" : `すべてコピー（${list.length}件）`}
          </Button>
        )
      }
    </CopyButton>
  );
}
