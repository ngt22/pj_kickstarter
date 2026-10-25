import { Anchor, AppShell, Box, Burger, Button, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { signOut } from "firebase/auth";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";

// actions はヘッダー右側に並べるページ固有のボタン（案件の画面の「付箋」など）
export default function Layout({ children, sidebar, actions }: { children: ReactNode; sidebar?: ReactNode; actions?: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [opened, { toggle, close }] = useDisclosure();
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={sidebar ? { width: 280, breakpoint: "sm", collapsed: { mobile: !opened } } : undefined}
      padding={{ base: "sm", sm: "xl" }}
    >
      <AppShell.Header>
        <Group h="100%" px={{ base: "sm", sm: "lg" }} gap="sm" wrap="nowrap">
          {sidebar && <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="目次" />}
          <Anchor component={Link} to="/" c="inherit" underline="never" mr="auto" className="ks-brand">
            <span className="ks-brand-mark">K</span>
            Kickstarter
          </Anchor>
          {isAdmin && <Button component={Link} to="/admin" variant="subtle" size="xs" visibleFrom="xs">案件の管理</Button>}
          {isAdmin && <Button component={Link} to="/cli-login" variant="subtle" size="xs" visibleFrom="sm">CLI ログイン</Button>}
          <Text size="sm" c="dimmed" visibleFrom="md">{user?.email}</Text>
          {actions}
          <Button variant="default" size="xs" onClick={() => signOut(auth)}>ログアウト</Button>
        </Group>
      </AppShell.Header>
      {sidebar && (
        <AppShell.Navbar p="md" onClick={close}>
          <AppShell.Section grow style={{ overflowY: "auto" }}>{sidebar}</AppShell.Section>
        </AppShell.Navbar>
      )}
      <AppShell.Main>
        <Box maw={1120} mx="auto">{children}</Box>
      </AppShell.Main>
    </AppShell>
  );
}
