// React Flow で描く図（ER図・ユースケース図など）に共通の枠。
// 図の上に概要と「全画面で見る」を置き、全画面では同じ図をモーダルに大きく描く
import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from "@xyflow/react";
import { Box, Button, Group, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { usePrint } from "../lib/print";

type Props = {
  title: string;
  summary?: React.ReactNode;
  height: string; // 本文中での高さ（PDF では printHeight）
  printHeight?: string;
  // 本文中と全画面で、それぞれの高さで図を描く
  children: (height: string) => React.ReactNode;
};

export default function DiagramFrame({ title, summary, height, printHeight = height, children }: Props) {
  const print = usePrint();
  const [full, { open, close }] = useDisclosure(false);
  if (print)
    return (
      <Box className="ks-diagram" my="md">
        <Text size="sm" c="dimmed" mb="xs">{summary}</Text>
        <ReactFlowProvider>{children(printHeight)}</ReactFlowProvider>
      </Box>
    );
  return (
    <Box className="ks-diagram" my="md">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">{summary}</Text>
        <Button size="xs" variant="light" onClick={open}>全画面で見る</Button>
      </Group>
      <ReactFlowProvider>{children(height)}</ReactFlowProvider>
      <Modal opened={full} onClose={close} fullScreen title={title}>
        <ReactFlowProvider>{children("calc(100vh - 90px)")}</ReactFlowProvider>
      </Modal>
    </Box>
  );
}
