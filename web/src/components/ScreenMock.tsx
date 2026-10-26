// ```mock ブロック（YAML）を「画面イメージ」として描画する。
// 資料の本文と見分けがつくよう、方眼のステージの上に端末の枠を置き、中身は案件カラーのライトテーマで実際の画面風に描く。
// 部品は「- 種類: 中身」の形で並べる。使える種類は ELEMENTS を参照。
import {
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Group,
  List,
  MantineProvider,
  NativeSelect,
  Notification,
  Pagination,
  PasswordInput,
  Radio,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
  type MantineColorSchemeManager,
} from "@mantine/core";
import {
  IconBattery3,
  IconBell,
  IconCalendar,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconCircle,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconAppWindow,
  IconWorldWww,
  IconDots,
  IconFileText,
  IconHeart,
  IconHome,
  IconInbox,
  IconList,
  IconLock,
  IconMapPin,
  IconMessage,
  IconPhoto,
  IconSearch,
  IconSettings,
  IconShoppingCart,
  IconStar,
  IconUser,
  IconUsers,
  IconWifi,
  type Icon,
} from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseYaml } from "../lib/docs";
import {
  collectNotes,
  collectTransitions,
  DARK_SCHEME,
  excludeMock,
  kindOf,
  normalize,
  props,
  splitShell,
  type DeviceKind,
  type DisplayKind,
  type Element,
  type MockSpec,
  type Props,
} from "../lib/mock";
import { ProjectColorContext } from "../lib/projectColor";
import MockDrawing from "./MockDrawing";
import Scaled from "./Scaled";
import { cssVariablesResolver, theme } from "../theme";
import { ICON_STROKE } from "./icons";

export type { MockSpec };

// 端末の論理幅。資料の幅に合わせて縮小表示する。スマホで資料を見るときは、パソコンの画面を狭めて文字を読める大きさに保つ
// 枠の太さ（左右合計）も足して縮小する
const DEVICE_WIDTH = { desktop: 1024, desktopNarrow: 720, tablet: 820 + 32, mobile: 375 + 24 };

const BUTTON_VARIANT: Record<string, { variant: string; color?: string }> = {
  primary: { variant: "filled" },
  default: { variant: "default" },
  danger: { variant: "filled", color: "red" },
  link: { variant: "subtle" },
};

// メニューやタブの名前から、それらしいアイコンを選ぶ
const ICON_WORDS: [RegExp, Icon][] = [
  [/ホーム|トップ|home/i, IconHome],
  [/検索|探す|さがす|search/i, IconSearch],
  [/予約|予定|カレンダー|日程|スケジュール/, IconCalendar],
  [/お気に入り|いいね|保存/, IconHeart],
  [/通知|お知らせ/, IconBell],
  [/メッセージ|チャット|問い合わせ|お問い合わせ/, IconMessage],
  [/カート|購入|注文|買い物/, IconShoppingCart],
  [/設定|管理/, IconSettings],
  [/マイ|アカウント|プロフィール|会員/, IconUser],
  [/顧客|ユーザー|メンバー|スタッフ|会員一覧/, IconUsers],
  [/分析|レポート|集計|ダッシュボード|売上/, IconChartBar],
  [/一覧|リスト|履歴/, IconList],
  [/記事|ドキュメント|書類|請求|帳票/, IconFileText],
  [/写真|画像|ギャラリー/, IconPhoto],
  [/地図|アクセス|店舗/, IconMapPin],
  [/レビュー|評価/, IconStar],
];

function iconFor(label: string): Icon {
  return ICON_WORDS.find(([re]) => re.test(label))?.[1] ?? IconCircle;
}

const labelOf = (item: unknown) => String(props(item).label ?? "");

// 仕様表と対応させる番号（note: 1 など）。画面の一部ではなく注釈なので、ステージと同じ色で描く
// 画面の端まで広がる部品（ヘッダーやメニュー）は、番号を内側に置く
function Noted({ note, children, edge }: { note?: number | string; children: React.ReactNode; edge?: boolean }) {
  if (note == null) return <>{children}</>;
  return (
    <Box pos="relative" className="mock-noted">
      <span className="mock-note" data-edge={edge || undefined} aria-label={`注釈 ${note}`}>{note}</span>
      {children}
    </Box>
  );
}

// 遷移先は画面には書かず、ボタンに data-to とツールチップで持たせる（一覧はステージの下に出す）
function ToTip({ to, children }: { to?: string; children: React.ReactElement }) {
  if (!to) return children;
  return <Tooltip label={`${to} へ遷移`}>{children}</Tooltip>;
}

function MockButton({ p, size = "sm" }: { p: Props; size?: string }) {
  const v = BUTTON_VARIANT[p.variant ?? "default"] ?? BUTTON_VARIANT.default;
  return (
    <Noted note={p.note}>
      <ToTip to={p.to}>
        <Button size={size} variant={v.variant} color={v.color} disabled={p.disabled} fullWidth={p.full} data-to={p.to}>
          {p.label}
        </Button>
      </ToTip>
    </Noted>
  );
}

// 表のセル: 「[予約]」はボタン、「(済)」はバッジとして描く
function Cell({ value }: { value: unknown }) {
  const s = String(value ?? "");
  const button = /^\[(.+)\]$/.exec(s);
  if (button) return <Button size="compact-sm" variant="light">{button[1]}</Button>;
  const badge = /^\((.+)\)$/.exec(s);
  if (badge) return <Badge variant="light">{badge[1]}</Badge>;
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

// 一覧の行: 文字列だけなら箇条書き、{title, sub, meta, thumb} なら写真つきの行
function ListRow({ item }: { item: Props }) {
  const thumb = item.thumb ?? item.avatar;
  return (
    <Group className="mock-list-row" gap="sm" wrap="nowrap" data-to={item.to}>
      {thumb != null &&
        (item.avatar != null ? (
          <Avatar radius="xl" color="initials" name={String(item.title ?? "")} />
        ) : (
          <Box className="mock-thumb" aria-hidden>
            <IconPhoto size={18} stroke={ICON_STROKE} />
          </Box>
        ))}
      <Box flex={1} miw={0}>
        <Text size="sm" fw={600} truncate>{item.title}</Text>
        {item.sub && <Text size="xs" c="dimmed" truncate>{item.sub}</Text>}
      </Box>
      {item.meta && <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.meta}</Text>}
      {item.badge && <Badge variant="light">{item.badge}</Badge>}
      {item.to && <IconChevronRight size={16} stroke={ICON_STROKE} className="mock-dim-icon" />}
    </Group>
  );
}

const ELEMENTS: Record<string, (value: any, mobile: boolean) => React.ReactNode> = {
  // 上のバー。デスクトップはロゴ・リンク・ボタン、スマホは戻る・タイトル・右のボタン
  header: (v, mobile) => {
    const p = normalize("header", v);
    if (mobile)
      return (
        <Noted note={p.note} edge>
          <Group className="mock-appbar" justify="space-between" wrap="nowrap">
            <Box w={28}>{p.back && <IconChevronLeft size={22} stroke={ICON_STROKE} />}</Box>
            <Text fw={700} size="md" truncate>{p.title ?? "サービス名"}</Text>
            <Box w={28} ta="right">
              {p.action ? (
                <Text size="sm" c="var(--mantine-primary-color-filled)" fw={600}>{labelOf(p.action)}</Text>
              ) : (
                <IconDots size={20} stroke={ICON_STROKE} className="mock-dim-icon" />
              )}
            </Box>
          </Group>
        </Noted>
      );
    return (
      <Noted note={p.note} edge>
        <Group className="mock-topbar" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="md" radius="md" variant="filled" aria-hidden>
              <IconStar size={16} stroke={ICON_STROKE} />
            </ThemeIcon>
            <Text fw={700}>{p.title ?? "サービス名"}</Text>
          </Group>
          <Group gap="lg" wrap="nowrap">
            {(p.links ?? []).map((l: unknown) => (
              <Anchor key={labelOf(l)} size="sm" c="dimmed" underline="never">{labelOf(l)}</Anchor>
            ))}
            {[...(p.actions ?? []), ...(p.action ? [p.action] : [])].map((a: unknown, i: number) => (
              <MockButton key={i} p={props(a)} size="xs" />
            ))}
          </Group>
        </Group>
      </Noted>
    );
  },
  // 横のメニュー（デスクトップ）。スマホでは上に横並びのタブとして出す
  nav: (v, mobile) => {
    const p = normalize("nav", v);
    const items: unknown[] = p.items ?? [];
    const active = p.active ?? labelOf(items[0]);
    if (mobile)
      return (
        <Group className="mock-navchips" gap={6} wrap="nowrap">
          {items.map((it) => (
            <Badge key={labelOf(it)} size="lg" variant={labelOf(it) === active ? "filled" : "default"} radius="xl">
              {labelOf(it)}
            </Badge>
          ))}
        </Group>
      );
    return (
      <Noted note={p.note} edge>
        <Stack className="mock-sidebar" gap={2}>
          {p.brand && <Text fw={700} size="sm" px="sm" pb="sm">{p.brand}</Text>}
          {items.map((it) => {
            const label = labelOf(it);
            const I = iconFor(label);
            return (
              <UnstyledButton key={label} className="mock-navitem" data-active={label === active || undefined} data-to={props(it).to}>
                <I size={18} stroke={ICON_STROKE} />
                <span>{label}</span>
              </UnstyledButton>
            );
          })}
        </Stack>
      </Noted>
    );
  },
  // 下のタブバー（スマホ）
  tabbar: (v) => {
    const p = normalize("tabbar", v);
    const items: unknown[] = p.items ?? [];
    const active = p.active ?? labelOf(items[0]);
    return (
      <Noted note={p.note} edge>
        <Group className="mock-tabbar" grow gap={0} wrap="nowrap">
          {items.map((it) => {
            const label = labelOf(it);
            const I = iconFor(label);
            return (
              <Stack key={label} className="mock-tab" gap={2} align="center" data-active={label === active || undefined} data-to={props(it).to}>
                <I size={22} stroke={ICON_STROKE} />
                <span>{label}</span>
              </Stack>
            );
          })}
        </Group>
      </Noted>
    );
  },
  footer: (v) => {
    const p = normalize("footer", v);
    return (
      <Noted note={p.note} edge>
        <Group className="mock-footer" justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">{p.text ?? "© サービス名"}</Text>
          <Group gap="md" wrap="nowrap">
            {(p.links ?? []).map((l: unknown) => <Anchor key={labelOf(l)} size="xs" c="dimmed">{labelOf(l)}</Anchor>)}
          </Group>
        </Group>
      </Noted>
    );
  },
  heading: (v) => {
    const p = normalize("heading", v);
    return <Noted note={p.note}><Title order={p.level ?? 3}>{p.text}</Title></Noted>;
  },
  text: (v) => {
    const p = normalize("text", v);
    return <Noted note={p.note}><Text size="sm" c={p.dimmed ? "dimmed" : undefined}>{p.text}</Text></Noted>;
  },
  input: (v) => {
    const p = normalize("input", v);
    const common = { label: p.label, placeholder: p.placeholder, defaultValue: p.value, withAsterisk: p.required, description: p.help, error: p.error };
    if (p.type === "password") return <Noted note={p.note}><PasswordInput {...common} /></Noted>;
    if (p.type === "textarea") return <Noted note={p.note}><Textarea {...common} autosize minRows={3} /></Noted>;
    return <Noted note={p.note}><TextInput {...common} type={p.type ?? "text"} /></Noted>;
  },
  search: (v) => {
    const p = normalize("search", v);
    return (
      <Noted note={p.note}>
        <TextInput radius="xl" placeholder={p.placeholder ?? "検索"} leftSection={<IconSearch size={16} stroke={ICON_STROKE} />} />
      </Noted>
    );
  },
  select: (v) => {
    const p = normalize("select", v);
    return (
      <Noted note={p.note}>
        <NativeSelect label={p.label} withAsterisk={p.required} data={(p.options ?? []).map(String)} defaultValue={p.value} />
      </Noted>
    );
  },
  checkbox: (v) => {
    const p = normalize("checkbox", v);
    return <Noted note={p.note}><Checkbox label={p.label} defaultChecked={p.checked} /></Noted>;
  },
  radio: (v) => {
    const p = normalize("radio", v);
    return (
      <Noted note={p.note}>
        <Radio.Group label={p.label} defaultValue={p.value}>
          <Group gap="md" mt={6}>
            {(p.options ?? []).map((o: string) => <Radio key={o} value={o} label={o} />)}
          </Group>
        </Radio.Group>
      </Noted>
    );
  },
  button: (v) => <MockButton p={normalize("button", v)} />,
  buttons: (v) => {
    const p = normalize("buttons", v);
    return (
      <Group gap="xs" justify={p.align ?? "flex-end"} mt={4}>
        {(p.items ?? []).map((b: unknown, i: number) => <MockButton key={i} p={props(b)} />)}
      </Group>
    );
  },
  row: (v, mobile) => {
    const items: Element[] = normalize("row", v).items ?? [];
    return (
      <SimpleGrid cols={mobile ? 1 : items.length} spacing="md">
        <Items items={items} />
      </SimpleGrid>
    );
  },
  card: (v) => {
    const p = normalize("card", v);
    return (
      <Noted note={p.note}>
        <Card className="mock-card" padding="md" radius="md">
          <Stack gap="sm">
            {p.title && <Text fw={700} size="sm">{p.title}</Text>}
            <Items items={p.items} />
          </Stack>
        </Card>
      </Noted>
    );
  },
  // 数値のサマリー: [{label, value, delta}]
  stats: (v, mobile) => {
    const p = normalize("stats", v);
    const items: Props[] = (p.items ?? []).map((s: unknown) => props(s));
    return (
      <Noted note={p.note}>
        <SimpleGrid cols={mobile ? 2 : Math.min(items.length, 4)} spacing="md">
          {items.map((s, i) => {
            // YAML の「+2」は数値の 2 になるので、符号を付け直す
            const delta = typeof s.delta === "number" ? (s.delta > 0 ? `+${s.delta}` : String(s.delta)) : String(s.delta ?? "");
            const down = delta.startsWith("-") || delta.startsWith("−");
            return (
              <Card key={i} className="mock-card" padding="md" radius="md">
                <Text size="xs" c="dimmed">{s.label}</Text>
                <Group gap={6} align="baseline" mt={4}>
                  <Text fz={22} fw={700} lh={1.2}>{s.value}</Text>
                  {delta && <Text size="xs" fw={600} c={down ? "red.7" : "teal.7"}>{delta}</Text>}
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Noted>
    );
  },
  table: (v) => {
    const p = normalize("table", v);
    return (
      <Noted note={p.note}>
        <Card className="mock-card" padding={0} radius="md">
          <Table.ScrollContainer minWidth={300}>
            <Table fz="sm" verticalSpacing="sm" highlightOnHover>
              <Table.Thead className="mock-thead">
                <Table.Tr>{(p.columns ?? []).map((c: string, i: number) => <Table.Th key={i}>{c}</Table.Th>)}</Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(p.rows ?? []).map((r: unknown[], i: number) => (
                  <Table.Tr key={i}>{r.map((c, j) => <Table.Td key={j}><Cell value={c} /></Table.Td>)}</Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </Noted>
    );
  },
  list: (v) => {
    const p = normalize("list", v);
    const items: unknown[] = p.items ?? [];
    const rich = items.some((it) => it && typeof it === "object");
    if (!rich)
      return (
        <Noted note={p.note}>
          <List size="sm" spacing={4}>{items.map((s, i) => <List.Item key={i}>{String(s)}</List.Item>)}</List>
        </Noted>
      );
    return (
      <Noted note={p.note}>
        <Card className="mock-card" padding={0} radius="md">
          {items.map((it, i) => (
            <ListRow key={i} item={props(it, "title")} />
          ))}
        </Card>
      </Noted>
    );
  },
  tabs: (v) => {
    const p = normalize("tabs", v);
    const items: string[] = (p.items ?? []).map(String);
    return (
      <Noted note={p.note}>
        <Tabs defaultValue={p.active ?? items[0]}>
          <Tabs.List>{items.map((t) => <Tabs.Tab key={t} value={t}>{t}</Tabs.Tab>)}</Tabs.List>
        </Tabs>
      </Noted>
    );
  },
  breadcrumb: (v) => {
    const p = normalize("breadcrumb", v);
    const items: string[] = (p.items ?? []).map(labelOf);
    return (
      <Noted note={p.note}>
        <Breadcrumbs separator={<IconChevronRight size={14} stroke={ICON_STROKE} />} fz="xs">
          {items.map((s, i) => (i < items.length - 1 ? <Anchor key={i} size="xs">{s}</Anchor> : <Text key={i} size="xs" c="dimmed">{s}</Text>))}
        </Breadcrumbs>
      </Noted>
    );
  },
  stepper: (v) => {
    const p = normalize("stepper", v);
    const items: string[] = (p.items ?? []).map(labelOf);
    const active = typeof p.active === "number" ? p.active - 1 : Math.max(0, items.indexOf(p.active));
    return (
      <Noted note={p.note}>
        <Stepper active={active} size="xs">
          {items.map((s) => <Stepper.Step key={s} label={s} />)}
        </Stepper>
      </Noted>
    );
  },
  pagination: (v) => {
    const p = props(v, "total");
    return (
      <Noted note={p.note}>
        <Group justify="center"><Pagination total={Number(p.total ?? 5)} defaultValue={Number(p.page ?? 1)} size="sm" /></Group>
      </Noted>
    );
  },
  avatar: (v) => {
    const p = normalize("avatar", v);
    return (
      <Noted note={p.note}>
        <Group gap="sm" wrap="nowrap">
          <Avatar radius="xl" color="initials" name={String(p.name ?? "")} />
          <Box>
            <Text size="sm" fw={600}>{p.name}</Text>
            {p.role && <Text size="xs" c="dimmed">{p.role}</Text>}
          </Box>
        </Group>
      </Noted>
    );
  },
  badge: (v) => {
    const p = normalize("badge", v);
    return <Noted note={p.note}><Badge variant="light" color={p.color}>{p.text}</Badge></Noted>;
  },
  alert: (v) => {
    const p = props(v, "text");
    return <Noted note={p.note}><Alert color={p.color ?? "blue"} title={p.title}>{p.text}</Alert></Noted>;
  },
  toast: (v) => {
    const p = normalize("toast", v);
    const color = { success: "teal", error: "red", info: undefined }[String(p.tone ?? "success")] ?? undefined;
    return (
      <Noted note={p.note}>
        <Notification color={color} title={p.title} withCloseButton withBorder className="mock-toast">{p.text}</Notification>
      </Noted>
    );
  },
  // データがないときの表示
  empty: (v) => {
    const p = normalize("empty", v);
    return (
      <Noted note={p.note}>
        <Stack className="mock-empty" align="center" gap="xs">
          <ThemeIcon size={48} radius="xl" variant="light" aria-hidden><IconInbox size={24} stroke={ICON_STROKE} /></ThemeIcon>
          <Text fw={700} size="sm">{p.title ?? "まだデータがありません"}</Text>
          {p.hint && <Text size="xs" c="dimmed" ta="center">{p.hint}</Text>}
          {p.action && <Box mt={4}><MockButton p={{ variant: "primary", ...props(p.action) }} /></Box>}
        </Stack>
      </Noted>
    );
  },
  image: (v) => {
    const p = normalize("image", v);
    return (
      <Noted note={p.note}>
        <Box className="mock-image" h={p.height ?? 160}>
          <IconPhoto size={28} stroke={ICON_STROKE} />
          {p.label && <span>{p.label}</span>}
        </Box>
      </Noted>
    );
  },
  // 図面と指摘位置のピン
  drawing: (v, mobile) => {
    const p = normalize("drawing", v);
    return (
      <Noted note={p.note}>
        <MockDrawing p={p} narrow={mobile} />
      </Noted>
    );
  },
  divider: () => <Divider />,
  space: (v) => <Box h={typeof v === "number" ? v : 16} />,
};

export const ELEMENT_TYPES = Object.keys(ELEMENTS);

const MobileContext = createContext(false);

function MockElement({ el }: { el: Element }) {
  const mobile = useContext(MobileContext);
  const [kind, value] = kindOf(el);
  const render = kind ? ELEMENTS[kind] : undefined;
  if (!render) return <Code c="red">不明な部品: {String(kind)}</Code>;
  return <>{render(value, mobile)}</>;
}

// 画面イメージは資料のダークモードに関係なく、常にライトテーマで描く。
// Mantine の部品のダーク用の配色は「:where([data-mantine-color-scheme='dark']) .クラス」の形で書かれていて、
// ページ全体がダークのときは画面イメージの中にも効いてしまう。ダーク用の規則に「.mock-app の中では使わない」条件を足して外す
let darkRulesScoped = false;

function scopeDarkRules() {
  if (darkRulesScoped || typeof document === "undefined") return;
  darkRulesScoped = true;
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && DARK_SCHEME.test(rule.selectorText)) rule.selectorText = excludeMock(rule.selectorText);
      else if (rule instanceof CSSGroupingRule) visit(rule.cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // 別オリジンのスタイルシートは読めないので飛ばす
    }
  }
}

const lightOnly: MantineColorSchemeManager = {
  get: () => "light",
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

function AppTheme({ color, children }: { color: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const primary = color in (theme.colors ?? {}) ? color : "brand";
  const appTheme = useMemo(() => ({ ...theme, primaryColor: primary, primaryShade: 6 as const }), [primary]);
  useLayoutEffect(scopeDarkRules, []);
  return (
    <MantineProvider
      theme={appTheme}
      cssVariablesResolver={cssVariablesResolver}
      cssVariablesSelector={`.mock-app-${primary}`}
      colorSchemeManager={lightOnly}
      forceColorScheme="light"
      getRootElement={() => root.current ?? undefined}
      withGlobalClasses={false}
    >
      <div ref={root} className={`mock-app mock-app-${primary}`} data-mantine-color-scheme="light">
        {children}
      </div>
    </MantineProvider>
  );
}

// タブレットは部品の並びをパソコンと同じにし、下のタブはそのまま残す
function Screen({ spec, kind }: { spec: MockSpec; kind: DeviceKind }) {
  const mobile = kind === "mobile";
  const shell = splitShell(spec.body);
  // スマホ向けに書いた画面をパソコンで見るときは、下のタブを横のメニューにする
  if (kind === "desktop" && shell.tabbar && !shell.nav) {
    shell.nav = { nav: kindOf(shell.tabbar)[1] };
    shell.tabbar = undefined;
  }
  const main = (
    <Stack className="mock-main" gap="md">
      <Items items={shell.main} />
    </Stack>
  );
  return (
    <MobileContext.Provider value={mobile}>
      <div className="mock-screen">
        {shell.header && <MockElement el={shell.header} />}
        {shell.nav && mobile && <MockElement el={shell.nav} />}
        {shell.nav && !mobile ? (
          <div className="mock-with-nav">
            <MockElement el={shell.nav} />
            {main}
          </div>
        ) : (
          main
        )}
        {shell.footer && <MockElement el={shell.footer} />}
        {shell.tabbar && <MockElement el={shell.tabbar} />}
      </div>
    </MobileContext.Provider>
  );
}

function StatusBar({ island }: { island?: boolean }) {
  return (
    <div className="mock-statusbar">
      <span>9:41</span>
      {island && <span className="mock-island" />}
      <span className="mock-status-icons">
        <IconWifi size={14} stroke={2} />
        <IconBattery3 size={18} stroke={1.8} />
      </span>
    </div>
  );
}

// スマホ・タブレットのブラウザで開いたときのアドレスバー（PWA ではブラウザの枠が消える）
function MobileUrl({ url }: { url: string }) {
  return (
    <div className="mock-mobile-url">
      <span>
        <IconLock size={11} stroke={2} />
        {url}
      </span>
    </div>
  );
}

// パソコンで PWA としてインストールしたときの窓: アドレスバーの代わりにアプリ名だけのタイトルバー
function AppTitleBar({ name }: { name: string }) {
  return (
    <div className="mock-toolbar" data-pwa="">
      <span className="mock-app-title">
        <ThemeIcon size={18} radius="sm" variant="filled" aria-hidden>
          <IconStar size={11} stroke={ICON_STROKE} />
        </ThemeIcon>
        {name}
      </span>
      <span className="mock-window-controls" aria-hidden><i /><i /><i /></span>
    </div>
  );
}

// display が undefined（PWA の切り替えなし）のときは、スマホ・タブレットはブラウザの枠なし（従来の見た目）、パソコンはブラウザで描く
function Device({ spec, kind, display }: { spec: MockSpec; kind: DeviceKind; display?: DisplayKind }) {
  const url = `example.com${spec.title?.startsWith("/") ? spec.title : `/${spec.title ?? ""}`}`;
  const showUrl = display === "browser";
  if (kind !== "desktop")
    return (
      <div className={kind === "mobile" ? "mock-phone" : "mock-tablet"}>
        <StatusBar island={kind === "mobile"} />
        {showUrl && <MobileUrl url={url} />}
        <Screen spec={spec} kind={kind} />
        <div className="mock-home-indicator" />
      </div>
    );
  return (
    <div className="mock-browser">
      {display === "pwa" ? (
        <AppTitleBar name={spec.app ?? appName(spec) ?? "アプリ"} />
      ) : (
        <div className="mock-toolbar">
          <span className="mock-lights"><i /><i /><i /></span>
          <span className="mock-url">
            <IconLock size={12} stroke={2} />
            {url}
          </span>
        </div>
      )}
      <Screen spec={spec} kind="desktop" />
    </div>
  );
}

function appName(spec: MockSpec): string | undefined {
  const header = splitShell(spec.body).header;
  if (!header) return undefined;
  const t = normalize("header", kindOf(header)[1]).title;
  return t == null ? undefined : String(t);
}

const DEVICES: Record<DeviceKind, { label: string; icon: Icon }> = {
  desktop: { label: "パソコン", icon: IconDeviceDesktop },
  tablet: { label: "タブレット", icon: IconDeviceTablet },
  mobile: { label: "スマートフォン", icon: IconDeviceMobile },
};

const DISPLAYS: Record<DisplayKind, { label: string; icon: Icon }> = {
  browser: { label: "ブラウザ", icon: IconWorldWww },
  pwa: { label: "アプリ（PWA）", icon: IconAppWindow },
};

function Switch<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: Record<T, { label: string; icon: Icon }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="mock-switch" role="group" aria-label={label}>
      {(Object.keys(options) as T[]).map((k) => {
        const o = options[k];
        return (
          <button key={k} type="button" aria-pressed={k === value} onClick={() => onChange(k)}>
            <o.icon size={14} stroke={ICON_STROKE} />
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

const pick = <T extends string>(all: Record<T, unknown>, keys: T[]) =>
  Object.fromEntries(keys.map((k) => [k, all[k]])) as Record<T, { label: string; icon: Icon }>;

export default function ScreenMock({ source }: { source: string }) {
  const color = useContext(ProjectColorContext);
  const narrow = useMediaQuery("(max-width: 48em)");
  // 原稿の device・display は最初に見せる端末と表示。帯の切り替えで、同じ画面を別の端末・表示でも見られる
  const [view, setView] = useState<DeviceKind>();
  const [shown, setShown] = useState<DisplayKind>();
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<MockSpec>(source);
      if (!Array.isArray(spec?.body)) throw new Error("body に部品を並べてください");
      return { spec, notes: collectNotes(spec.body), transitions: collectTransitions(spec.body) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  if ("error" in parsed) return <Code block c="red">画面モックを読めません: {parsed.error}</Code>;
  const { spec, notes, transitions } = parsed;
  const initial = spec.device ?? "desktop";
  // tablet は原稿に書いたときだけ切り替えに出す。並びはパソコン → タブレット → スマホに揃える
  const listed = spec.devices ?? (initial === "tablet" ? ["desktop", "tablet", "mobile"] : ["desktop", "mobile"]);
  const devices = (Object.keys(DEVICES) as DeviceKind[]).filter((d) => listed.includes(d) || d === initial);
  const kind = view ?? initial;
  const withPwa = !!spec.pwa || spec.display === "pwa";
  const display = withPwa ? (shown ?? spec.display ?? "browser") : undefined;
  const DeviceIcon = DEVICES[kind].icon;

  return (
    <figure className="mock-stage" data-device={kind}>
      <figcaption className="mock-band">
        <span className="mock-band-pill">
          <DeviceIcon size={14} stroke={ICON_STROKE} />
          画面イメージ
        </span>
        <span className="mock-band-note">実際のデザインとは異なります</span>
        <span className="mock-switches">
          {withPwa && display && <Switch label="表示のしかた" options={DISPLAYS} value={display} onChange={setShown} />}
          {devices.length > 1 && <Switch label="表示する端末" options={pick(DEVICES, devices)} value={kind} onChange={setView} />}
        </span>
      </figcaption>
      <div className="mock-body">
        <div className="mock-device">
          <Scaled width={kind === "desktop" ? DEVICE_WIDTH[narrow ? "desktopNarrow" : "desktop"] : DEVICE_WIDTH[kind]}>
            <AppTheme color={color}>
              <Device spec={spec} kind={kind} display={display} />
            </AppTheme>
          </Scaled>
        </div>
        {notes.length > 0 && (
          <ol className="mock-notes" aria-label="注釈">
            {notes.map((n, i) => (
              <li key={i}>
                <span className="mock-note-num">{n.n}</span>
                {n.label}
              </li>
            ))}
          </ol>
        )}
      </div>
      {transitions.length > 0 && (
        <div className="mock-transitions">
          <span className="mock-transitions-label">画面遷移</span>
          {transitions.map((t, i) => (
            <span key={i} className="mock-transition">
              {t.label && <>{t.label}<IconChevronRight size={12} stroke={2} /></>}
              <b>{t.to}</b>
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
