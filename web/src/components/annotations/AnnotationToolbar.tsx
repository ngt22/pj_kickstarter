import { ActionIcon, Button, ColorSwatch, Divider, Group, Paper, Popover, Slider, Stack, Text, Tooltip, useMantineTheme } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconArrowBackUp, IconHandStop, IconMessage, IconPencil, IconTrash } from "@tabler/icons-react";
import { INK_COLORS, INK_LABELS, sampleSpacing, type InkColor } from "../../lib/annotations";
import { ICON_STROKE } from "../icons";

export type Tool = "view" | "pen" | "memo";

const TOOLS: { value: Tool; label: string; icon: typeof IconPencil }[] = [
  { value: "view", label: "閲覧（スクロール・付箋を開く）", icon: IconHandStop },
  { value: "pen", label: "ペン", icon: IconPencil },
  { value: "memo", label: "メモ（気になる箇所を押して、指示を書く）", icon: IconMessage },
];

type Props = {
  tool: Tool;
  onTool(t: Tool): void;
  color: InkColor;
  onColor(c: InkColor): void;
  smoothness: number;
  onSmoothness(v: number): void;
  canUndo: boolean;
  onUndo(): void;
  onSave(): void;
  onDiscard(): void;
  shifted: boolean; // 一覧が開いているときは、その左に寄せる
};

// 付箋モードの道具箱。画面の右上（ヘッダーの下）に浮かせる
export default function AnnotationToolbar(p: Props) {
  const theme = useMantineTheme();
  const inkColors = theme.other.inkColors as Record<InkColor, string>;
  return (
    <Paper className="ks-annot-toolbar" data-annot-ui data-shifted={p.shifted || undefined} shadow="md" radius="lg" p={6} withBorder>
      <Group gap={4} justify="flex-end">
        {TOOLS.map(({ value, label, icon: Icon }) => (
          <Tooltip key={value} label={label}>
            <ActionIcon
              size="lg"
              variant={p.tool === value ? "filled" : "subtle"}
              color={p.tool === value ? "brand" : "gray"}
              onClick={() => p.onTool(value)}
              aria-label={label}
              aria-pressed={p.tool === value}
            >
              <Icon size={20} stroke={ICON_STROKE} />
            </ActionIcon>
          </Tooltip>
        ))}
        <Divider orientation="vertical" mx={2} />
        {INK_COLORS.map((c) => (
          <Tooltip key={c} label={INK_LABELS[c]}>
            <ColorSwatch
              component="button"
              type="button"
              color={inkColors[c]}
              size={p.color === c ? 26 : 20}
              className="ks-annot-swatch"
              data-selected={p.color === c || undefined}
              onClick={() => p.onColor(c)}
              aria-label={INK_LABELS[c]}
              aria-pressed={p.color === c}
            />
          </Tooltip>
        ))}
        <Popover width={240} position="bottom-end" shadow="md">
          <Popover.Target>
            <Tooltip label="ペンの滑らかさ">
              <ActionIcon size="lg" variant="subtle" color="gray" aria-label="ペンの滑らかさ">
                <IconAdjustmentsHorizontal size={20} stroke={ICON_STROKE} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap={6}>
              <Text size="sm" fw={700}>ペンの滑らかさ</Text>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={p.smoothness}
                onChange={p.onSmoothness}
                label={(v) => `${sampleSpacing(v).toFixed(1)}px ごと`}
                marks={[{ value: 0, label: "そのまま" }, { value: 1, label: "滑らか" }]}
                mb="md"
              />
              <Text size="xs" c="dimmed">右ほど点を間引いて手ぶれを抑えます。細かい字を書くときは左に寄せてください。</Text>
            </Stack>
          </Popover.Dropdown>
        </Popover>
        <Divider orientation="vertical" mx={2} />
        <Tooltip label="戻る（1 ストローク取り消す・Ctrl+Z）">
          <ActionIcon size="lg" variant="subtle" color="gray" disabled={!p.canUndo} onClick={p.onUndo} aria-label="戻る">
            <IconArrowBackUp size={20} stroke={ICON_STROKE} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="書きかけを全部消す">
          <ActionIcon size="lg" variant="subtle" color="gray" disabled={!p.canUndo} onClick={p.onDiscard} aria-label="書きかけを全部消す">
            <IconTrash size={20} stroke={ICON_STROKE} />
          </ActionIcon>
        </Tooltip>
        <Button size="sm" disabled={!p.canUndo} onClick={p.onSave} ml={2}>保存</Button>
      </Group>
    </Paper>
  );
}
