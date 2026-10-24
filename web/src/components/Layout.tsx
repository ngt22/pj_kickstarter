import { Anchor, AppShell, Box, Burger, Button, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { signOut } from "firebase/auth";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { auth } from "../lib/firebase";

export default function Layout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [opened, { toggle, close }] = useDisclosure();
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={sidebar ? { width: 260, breakpoint: "sm", collapsed: { mobile: !opened } } : undefined}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          {sidebar && <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="目次" />}
          <Anchor component={Link} to="/" fw={700} c="inherit" underline="never" mr="auto">Kickstarter</Anchor>
          {isAdmin && <Button component={Link} to="/admin" variant="subtle" size="xs">閲覧権限</Button>}
          <Text size="sm" c="dimmed" visibleFrom="xs">{user?.email}</Text>
          <Button variant="default" size="xs" onClick={() => signOut(auth)}>ログアウト</Button>
        </Group>
      </AppShell.Header>
      {sidebar && (
        <AppShell.Navbar p="sm" onClick={close}>
          <AppShell.Section grow style={{ overflowY: "auto" }}>{sidebar}</AppShell.Section>
        </AppShell.Navbar>
      )}
      <AppShell.Main>
        <Box maw={1100}>{children}</Box>
      </AppShell.Main>
    </AppShell>
  );
}
