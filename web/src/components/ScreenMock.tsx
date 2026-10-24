// ```mock ブロック（YAML）を Mantine の部品で画面モックとして描画する。
// 部品は「- 種類: 中身」の形で並べる。使える種類は ELEMENTS を参照。
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Group,
  List,
  NativeSelect,
  PasswordInput,
  Radio,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMemo } from "react";
import { parseYaml } from "../lib/docs";

type Props = Record<string, any>;
type Element = Record<string, any>;

export type MockSpec = {
  device?: "desktop" | "mobile";
  title?: string;
  body: Element[];
};

const BUTTON_VARIANT: Record<string, { variant: string; color?: string }> = {
  primary: { variant: "filled" },
  default: { variant: "default" },
  danger: { variant: "filled", color: "red" },
  link: { variant: "subtle" },
};

// 「種類: 文字列」の短縮形を props に揃える
function props(value: unknown, key = "label"): Props {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Props;
  return { [key]: value };
}

// 仕様表と対応させる番号（note: 1 など）
function Note({ n }: { n?: number | string }) {
  if (n == null) return null;
  return (
    <Badge className="mock-note" circle size="sm" color="red">
      {n}
    </Badge>
  );
}

function Noted({ note, children, grow }: { note?: number | string; children: React.ReactNode; grow?: boolean }) {
  if (note == null) return <>{children}</>;
  return (
    <Box pos="relative" style={grow ? { flex: 1 } : undefined}>
      <Note n={note} />
      {children}
    </Box>
  );
}

function MockButton({ p }: { p: Props }) {
  const v = BUTTON_VARIANT[p.variant ?? "default"] ?? BUTTON_VARIANT.default;
  return (
    <Noted note={p.note}>
      <Group gap={4} wrap="nowrap">
        <Button size="xs" variant={v.variant} color={v.color} disabled={p.disabled} fullWidth={p.full}>
          {p.label}
        </Button>
        {p.to && <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>→ {p.to}</Text>}
      </Group>
    </Noted>
  );
}

// 表のセル: 「[予約]」はボタン、「(済)」はバッジとして描く
function Cell({ value }: { value: unknown }) {
  const s = String(value ?? "");
  const button = /^\[(.+)\]$/.exec(s);
  if (button) return <Button size="compact-xs" variant="light">{button[1]}</Button>;
  const badge = /^\((.+)\)$/.exec(s);
  if (badge) return <Badge size="sm" variant="light">{badge[1]}</Badge>;
  return <>{s}</>;
}

function Items({ items }: { items?: Element[] }) {
  return (
    <>
      {(items ?? []).map((el, i) => (
        <MockElement key={i} el={el} />
      ))}
    </>
  );
}

const ELEMENTS: Record<string, (value: any) => React.ReactNode> = {
  header: (v) => {
    const p = props(v, "title");
    return (
      <Noted note={p.note}>
        <Group className="mock-header" justify="space-between" wrap="nowrap">
          <Text fw={700}>{p.title ?? "ロゴ"}</Text>
          <Group gap="sm" wrap="nowrap">
            {(p.links ?? []).map((l: string) => <Anchor key={l} size="sm">{l}</Anchor>)}
            {(p.actions ?? []).map((a: unknown, i: number) => <MockButton key={i} p={props(a)} />)}
          </Group>
        </Group>
      </Noted>
    );
  },
  heading: (v) => {
    const p = props(v, "text");
    return <Noted note={p.note}><Title order={p.level ?? 3}>{p.text}</Title></Noted>;
  },
  text: (v) => {
    const p = props(v, "text");
    return <Noted note={p.note}><Text size="sm" c={p.dimmed ? "dimmed" : undefined}>{p.text}</Text></Noted>;
  },
  input: (v) => {
    const p = props(v);
    const common = { label: p.label, placeholder: p.placeholder, defaultValue: p.value, withAsterisk: p.required, description: p.help, error: p.error, size: "xs" as const };
    if (p.type === "password") return <Noted note={p.note}><PasswordInput {...common} /></Noted>;
    if (p.type === "textarea") return <Noted note={p.note}><Textarea {...common} autosize minRows={2} /></Noted>;
    return <Noted note={p.note}><TextInput {...common} type={p.type ?? "text"} /></Noted>;
  },
  select: (v) => {
    const p = props(v);
    return (
      <Noted note={p.note}>
        <NativeSelect size="xs" label={p.label} withAsterisk={p.required} data={(p.options ?? []).map(String)} defaultValue={p.value} />
      </Noted>
    );
  },
  checkbox: (v) => {
    const p = props(v);
    return <Noted note={p.note}><Checkbox size="xs" label={p.label} defaultChecked={p.checked} /></Noted>;
  },
  radio: (v) => {
    const p = props(v);
    return (
      <Noted note={p.note}>
        <Radio.Group size="xs" label={p.label} defaultValue={p.value}>
          <Group gap="md" mt={4}>
            {(p.options ?? []).map((o: string) => <Radio key={o} size="xs" value={o} label={o} />)}
          </Group>
        </Radio.Group>
      </Noted>
    );
  },
  button: (v) => <MockButton p={props(v)} />,
  buttons: (v) => (
    <Group gap="xs" justify={Array.isArray(v) ? "flex-end" : (v.align ?? "flex-end")}>
      {(Array.isArray(v) ? v : v.items).map((b: unknown, i: number) => <MockButton key={i} p={props(b)} />)}
    </Group>
  ),
  row: (v) => {
    const items: Element[] = Array.isArray(v) ? v : v.items;
    return (
      <SimpleGrid cols={{ base: 1, xs: items.length }} spacing="sm">
        <Items items={items} />
      </SimpleGrid>
    );
  },
  card: (v) => {
    const p = props(v, "title");
    return (
      <Noted note={p.note}>
        <Card withBorder padding="sm" radius="md">
          <Stack gap="xs">
            {p.title && <Text fw={700} size="sm">{p.title}</Text>}
            <Items items={p.items} />
          </Stack>
        </Card>
      </Noted>
    );
  },
  table: (v) => {
    const p = props(v);
    return (
      <Noted note={p.note}>
        <Table.ScrollContainer minWidth={300}>
          <Table withTableBorder fz="xs" verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>{(p.columns ?? []).map((c: string) => <Table.Th key={c}>{c}</Table.Th>)}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(p.rows ?? []).map((r: unknown[], i: number) => (
                <Table.Tr key={i}>{r.map((c, j) => <Table.Td key={j}><Cell value={c} /></Table.Td>)}</Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Noted>
    );
  },
  list: (v) => {
    const p = Array.isArray(v) ? { items: v } : props(v);
    return (
      <Noted note={p.note}>
        <List size="sm" spacing={2}>{p.items.map((s: string, i: number) => <List.Item key={i}>{s}</List.Item>)}</List>
      </Noted>
    );
  },
  tabs: (v) => {
    const p = Array.isArray(v) ? { items: v } : props(v);
    return (
      <Noted note={p.note}>
        <Tabs defaultValue={p.active ?? p.items[0]}>
          <Tabs.List>{p.items.map((t: string) => <Tabs.Tab key={t} value={t}>{t}</Tabs.Tab>)}</Tabs.List>
        </Tabs>
      </Noted>
    );
  },
  alert: (v) => {
    const p = props(v, "text");
    return <Noted note={p.note}><Alert color={p.color ?? "blue"} title={p.title} p="xs">{p.text}</Alert></Noted>;
  },
  image: (v) => {
    const p = props(v);
    return (
      <Noted note={p.note}>
        <Box className="mock-image" h={p.height ?? 120}>{p.label ?? "画像"}</Box>
      </Noted>
    );
  },
  divider: () => <Divider />,
  space: (v) => <Box h={typeof v === "number" ? v : 16} />,
};

export const ELEMENT_TYPES = Object.keys(ELEMENTS);

function MockElement({ el }: { el: Element }) {
  const [kind, value] = Object.entries(el ?? {})[0] ?? [];
  const render = kind ? ELEMENTS[kind] : undefined;
  if (!render) return <Code c="red">不明な部品: {String(kind)}</Code>;
  return <>{render(value)}</>;
}

export default function ScreenMock({ source }: { source: string }) {
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<MockSpec>(source);
      if (!Array.isArray(spec?.body)) throw new Error("body に部品を並べてください");
      return { spec };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  if ("error" in parsed) return <Code block c="red">画面モックを読めません: {parsed.error}</Code>;
  const { spec } = parsed;
  const mobile = spec.device === "mobile";

  return (
    <div className={`mock mock-${mobile ? "mobile" : "desktop"}`}>
      <div className="mock-chrome">
        {mobile ? <span className="mock-notch" /> : <><i /><i /><i /></>}
        {!mobile && spec.title && <span className="mock-url">{spec.title}</span>}
      </div>
      <Stack className="mock-screen" gap="sm">
        <Items items={spec.body} />
      </Stack>
    </div>
  );
}
