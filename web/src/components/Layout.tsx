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
          {isAdmin && <Button component={Link} to="/admin" variant="subtle" size="xs">閲覧権限</Button>}
          <Text size="sm" c="dimmed" visibleFrom="xs">{user?.email}</Text>
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
