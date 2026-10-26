// 画面モック（```mock）の部品の並びから、端末の枠・注釈・遷移の一覧を組み立てる（描画は components/ScreenMock.tsx）
export type Element = Record<string, any>;
export type Props = Record<string, any>;

export type DeviceKind = "desktop" | "tablet" | "mobile";
export type DisplayKind = "browser" | "pwa";
export type Orientation = "portrait" | "landscape";

export type MockSpec = {
  device?: DeviceKind;
  devices?: DeviceKind[];
  pwa?: boolean;
  display?: DisplayKind;
  app?: string;
  title?: string;
  // 帯に出す画面ID。省略すると直前の見出し（## SC-01 …）から取る
  screen?: string;
  orientation?: Orientation;
  // field: 屋外・暗所向けの高コントラスト・大きめの文字とボタン
  theme?: "default" | "field";
  body: Element[];
};

// 「種類: 文字列」の短縮形を props に揃える
export function props(value: unknown, key = "label"): Props {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Props;
  return { [key]: value };
}

// 「- 種類: [..]」の短縮形を items に揃える
export function itemsOf(value: unknown): Props {
  return Array.isArray(value) ? { items: value } : props(value);
}

// 並びを書ける部品（「- list: [a, b]」の短縮形）と、文字列だけ書いたときの項目名
export const LIST_KINDS = new Set([
  "buttons", "row", "list", "tabs", "nav", "tabbar", "breadcrumb", "stats", "stepper", "actionbar", "segmented", "photos",
]);
const SHORT_KEY: Record<string, string> = {
  header: "title",
  heading: "text",
  text: "text",
  badge: "text",
  toast: "text",
  empty: "title",
  avatar: "name",
  search: "placeholder",
  footer: "text",
  drawing: "title",
  statusbar: "text",
  fab: "label",
  progress: "value",
};

export function normalize(kind: string, value: unknown): Props {
  if (LIST_KINDS.has(kind)) return itemsOf(value);
  return props(value, SHORT_KEY[kind] ?? "label");
}

export function kindOf(el: Element): [string, any] {
  const [kind, value] = Object.entries(el ?? {})[0] ?? [""];
  return [kind, value];
}

// 注釈の一覧に出す名前。部品に名前がないときは種類名で補う
const KIND_LABEL: Record<string, string> = {
  header: "ヘッダー",
  nav: "メニュー",
  tabbar: "タブバー",
  table: "一覧表",
  list: "リスト",
  tabs: "タブ",
  image: "画像",
  drawing: "図面",
  stats: "数値サマリー",
  search: "検索",
  breadcrumb: "パンくず",
  empty: "空の状態",
  stepper: "ステップ",
  pagination: "ページ送り",
  toast: "通知",
  footer: "フッター",
  card: "カード",
  avatar: "ユーザー",
  badge: "バッジ",
  photos: "写真",
  actionbar: "操作バー",
  statusbar: "状態表示",
  segmented: "切り替え",
  fab: "追加ボタン",
  progress: "進捗",
};

export type Note = { n: string; label: string };
export type Transition = { label: string; to: string };

function labelOf(kind: string, p: Props): string {
  const name = p.label ?? p.title ?? p.text ?? p.name ?? p.placeholder;
  return name != null && typeof name !== "object" ? String(name) : (KIND_LABEL[kind] ?? kind);
}

// 部品の中にある子部品・ボタンをたどる
function walk(items: Element[] | undefined, visit: (kind: string, p: Props) => void) {
  for (const el of items ?? []) {
    const [kind, value] = kindOf(el);
    if (kind === "row") {
      walk(itemsOf(value).items, visit);
      continue;
    }
    if (kind === "buttons" || kind === "actionbar") {
      if (kind === "actionbar") visit(kind, itemsOf(value));
      for (const b of itemsOf(value).items ?? []) visit("button", props(b));
      continue;
    }
    const p = normalize(kind, value);
    visit(kind, p);
    if (kind === "card") walk(p.items, visit);
    if (kind === "header") for (const a of p.actions ?? []) visit("button", props(a));
    if (kind === "list" || kind === "nav" || kind === "tabbar")
      for (const it of p.items ?? []) if (it && typeof it === "object") visit("item", it);
    if ((kind === "empty" || kind === "photos") && p.action) visit("button", props(p.action));
  }
}

export function collectNotes(body: Element[]): Note[] {
  const notes: Note[] = [];
  walk(body, (kind, p) => {
    if (p.note != null) notes.push({ n: String(p.note), label: labelOf(kind, p) });
  });
  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : Infinity);
  return notes.sort((a, b) => num(a.n) - num(b.n));
}

export function collectTransitions(body: Element[]): Transition[] {
  const seen = new Set<string>();
  const out: Transition[] = [];
  walk(body, (_kind, p) => {
    if (!p.to) return;
    const t = { label: String(p.label ?? p.title ?? ""), to: String(p.to) };
    const key = `${t.label}→${t.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out;
}

// 画面の骨組み: 先頭の header は上のバー、nav は横のメニュー、tabbar は下のタブ、footer は最後に置く。
// actionbar は画面の下に固定したボタン（tabbar の上）、fab は右下に浮かせたボタン
export type Shell = { header?: Element; nav?: Element; tabbar?: Element; footer?: Element; actionbar?: Element; fab?: Element; main: Element[] };

export function splitShell(body: Element[]): Shell {
  const shell: Shell = { main: [] };
  body.forEach((el, i) => {
    const [kind] = kindOf(el);
    if (kind === "header" && i === 0) shell.header = el;
    else if (kind === "nav" && !shell.nav) shell.nav = el;
    else if (kind === "tabbar" && !shell.tabbar) shell.tabbar = el;
    else if (kind === "footer" && !shell.footer) shell.footer = el;
    else if (kind === "actionbar" && !shell.actionbar) shell.actionbar = el;
    else if (kind === "fab" && !shell.fab) shell.fab = el;
    else shell.main.push(el);
  });
  return shell;
}

// ダーク用の CSS 規則のセレクターに「.mock-app の中では使わない」条件を足す（ScreenMock.tsx の scopeDarkRules で使う）
export const DARK_SCHEME = /\[data-mantine-color-scheme=["']?dark["']?\]/;
const NOT_IN_MOCK = ":where(:not(.mock-app *))";

// 括弧の外のカンマで区切る（:where(a, b) の中は区切らない）
function splitSelectors(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      out.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  out.push(selector.slice(start));
  return out.map((s) => s.trim());
}

// 疑似要素（::before など）の前に条件を差し込む
export function excludeMock(selector: string): string {
  return splitSelectors(selector)
    .map((s) => {
      if (!DARK_SCHEME.test(s)) return s;
      const pseudo = s.indexOf("::");
      return pseudo < 0 ? `${s}${NOT_IN_MOCK}` : `${s.slice(0, pseudo)}${NOT_IN_MOCK}${s.slice(pseudo)}`;
    })
    .join(", ");
}

// 原稿の ```mock ごとに、直前の見出しの画面ID（## SC-01 案件一覧 → SC-01）を対応させる。
// 帯のラベルと、ページ遷移図の画面サムネイルで使う
const SCREEN_HEADING = /^#{2,4}\s+([A-Za-z]+-\d+)/;
export function screenMocks(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | undefined;
  const re = /^(#{2,4}\s.*)$|^```mock[^\n]*\n([\s\S]*?)\n```/gm;
  for (let m = re.exec(markdown); m; m = re.exec(markdown)) {
    if (m[1]) {
      const id = SCREEN_HEADING.exec(m[1])?.[1];
      if (id || m[1].startsWith("## ")) current = id;
    }
    else if (current && !out.has(current)) out.set(current, m[2]);
  }
  return out;
}
