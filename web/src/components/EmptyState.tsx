import { Stack, Text, ThemeIcon } from "@mantine/core";
import type { ReactNode } from "react";
import { ICON_STROKE } from "./icons";

// 何も表示するものがないときの表示。アイコン・見出し・説明・次の行動を必ず並べる
export default function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack align="center" gap="xs" py="xl" px="md" className="ks-empty">
      <ThemeIcon size={56} radius="xl" variant="light" color="gray">
        <Icon size={28} stroke={ICON_STROKE} />
      </ThemeIcon>
      <Text fw={700} mt="xs">{title}</Text>
      {children && <Text size="sm" c="dimmed" ta="center" maw={420}>{children}</Text>}
      {action && <div style={{ marginTop: "var(--mantine-spacing-sm)" }}>{action}</div>}
    </Stack>
  );
}
