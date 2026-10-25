// 付箋（閲覧中に資料へ書き込む指示）。projects/{projectId}/annotations/{id} に 1 枚ずつ保存する。
// 1 枚の付箋は、ペンの線・囲み（中に文字を書ける）・引出線をまとめたもの。
// 座標は資料の枠（付箋レイヤー）の左上からの px。書いた位置の近くの要素（見出し・段落・表など）を目印として持ち、
// 画面の幅が変わって文章が折り返し直されても、目印からの位置で描き直す（幅の比で全体を拡大縮小する）。
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";

export type InkColor = "black" | "white" | "red" | "blue" | "green" | "yellow";
export const INK_COLORS: InkColor[] = ["black", "white", "red", "blue", "green", "yellow"];
export const INK_LABELS: Record<InkColor, string> = {
  black: "黒",
  white: "白",
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
};

export type Point = { x: number; y: number };

// 書き込んだ箇所にある資料の要素。指摘を LLM に渡すとき「どこの話か」を伝えるために保存する
// selector は付箋レイヤーからの CSS セレクタ、section は直前の見出し、text は要素の文字（先頭だけ）、
// rx / ry は要素の中のどこを指したか（左上 0、右下 100 の %）
export type Target = { selector: string; section: string; text: string; rx: number; ry: number };

// Firestore は配列の中に配列を持てないので、点の列は [x0, y0, x1, y1, ...] の平らな配列にする
// target はペンなら書き始め、囲みなら中心、引出線なら矢じりの下にある要素
export type PenItem = { kind: "pen"; color: InkColor; width: number; points: number[]; target?: Target };
export type BoxItem = { kind: "box"; color: InkColor; x: number; y: number; w: number; h: number; text: string; target?: Target };
// 引出線：points[0..1] が指している箇所（矢じり側）、points[2..3] が引き出した先。
// 囲みと引出線は初期の書き方で、いまはメモ（MemoItem）で書く。保存済みの付箋を表示するために残している
export type LineItem = { kind: "line"; color: InkColor; points: number[]; target?: Target };
// メモ：気になった箇所（px, py）に点を打ち、決まった長さの引出線の先にメモ欄（x, y, w, h）を置く。
// target は点の下にある要素。メモ欄は右下のつまみで大きさを変えられる
export type MemoItem = { kind: "memo"; color: InkColor; px: number; py: number; x: number; y: number; w: number; h: number; text: string; target?: Target };
export type InkItem = PenItem | BoxItem | LineItem | MemoItem;
// 文字を書ける四角（囲み・メモ欄）
export type TextItem = BoxItem | MemoItem;
export const isTextItem = (it: InkItem): it is TextItem => it.kind === "box" || it.kind === "memo";

// メモの引出線の長さ（縦・横それぞれ）と、メモ欄の最初の大きさ
export const MEMO_LEADER = 28;
export const MEMO_SIZE = { w: 220, h: 64 };

// 点を打った位置から、メモ欄を斜め右上に置く（資料の文字に重ならないよう、点の行より上に出す）。
// 右や上にはみ出すときは左・下へ折り返す
export function placeMemo(p: Point, areaWidth: number, size = MEMO_SIZE): { x: number; y: number } {
  const right = p.x + MEMO_LEADER + size.w <= areaWidth - 8;
  const up = p.y - MEMO_LEADER - size.h >= 0;
  return {
    x: right ? p.x + MEMO_LEADER : p.x - MEMO_LEADER - size.w,
    y: up ? p.y - MEMO_LEADER - size.h : p.y + MEMO_LEADER,
  };
}

// 引出線をメモ欄のどこにつなぐか：点からいちばん近いメモ欄の縁
export function memoAttach(m: MemoItem): Point {
  return { x: Math.min(Math.max(m.px, m.x), m.x + m.w), y: Math.min(Math.max(m.py, m.y), m.y + m.h) };
}

export type AnnotationStatus = "open" | "close";

// 目印：付箋レイヤーの中の要素を子の番号の列で指す。left/top は保存したときのその要素の位置
export type Anchor = { path: number[]; left: number; top: number };

export type Annotation = {
  id: string;
  docType: string; // 表紙・概要は COVER
  authorUid: string;
  authorName: string;
  authorEmail: string;
  items: InkItem[];
  comment: string;
  tags: string[];
  status: AnnotationStatus;
  anchor: Anchor;
  width: number; // 保存したときの付箋レイヤーの幅
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const COVER = "_cover";
export const PEN_WIDTH = 3;
export const MAX_ITEMS = 300;

// ---- ペンの線を滑らかにする ----
// smoothness は 0〜1。大きいほど点を間引き（サンプリング間隔を広げ）、手ぶれを強く抑える。
export type Smoother = { push(p: Point): boolean; finish(p: Point): void; points: Point[] };

export function sampleSpacing(smoothness: number) {
  return 1 + smoothness * 5; // 1〜6px ごとに 1 点
}

export function createSmoother(start: Point, smoothness: number): Smoother {
  const spacing = sampleSpacing(smoothness);
  // 指数移動平均の追従の速さ。1 で生の点そのまま、小さいほど遅れて付いてくる（ぶれが消える）
  const follow = 1 - smoothness * 0.75;
  const points: Point[] = [start];
  let pos = start;
  return {
    points,
    // 点を足したら true（描き直しが要る）
    push(raw) {
      pos = { x: pos.x + (raw.x - pos.x) * follow, y: pos.y + (raw.y - pos.y) * follow };
      const last = points[points.length - 1];
      if (Math.hypot(pos.x - last.x, pos.y - last.y) < spacing) return false;
      points.push(pos);
      return true;
    },
    // 指を離した位置まで線を届かせる（平均の遅れで線が短くならないように）
    finish(raw) {
      const last = points[points.length - 1];
      if (Math.hypot(raw.x - last.x, raw.y - last.y) >= 0.5) points.push(raw);
    },
  };
}

// 点の列を、隣どうしの中点を通る 2 次ベジェ曲線の path にする（角が出ない）
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  const [p0] = points;
  if (points.length === 1) return `M${f(p0.x)} ${f(p0.y)}l0.01 0`; // 点を打っただけでも丸い点を描く
  if (points.length === 2) return `M${f(p0.x)} ${f(p0.y)}L${f(points[1].x)} ${f(points[1].y)}`;
  let d = `M${f(p0.x)} ${f(p0.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    d += `Q${f(p.x)} ${f(p.y)} ${f((p.x + q.x) / 2)} ${f((p.y + q.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${f(last.x)} ${f(last.y)}`;
}

// 保存する前に、見た目が変わらない程度（epsilon px）に点を減らす（Ramer–Douglas–Peucker）
export function simplify(points: Point[], epsilon = 0.6): Point[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = points[a];
    const pb = points[b];
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    let worst = -1;
    let dist = 0;
    for (let i = a + 1; i < b; i++) {
      const p = points[i];
      const d =
        len === 0
          ? Math.hypot(p.x - pa.x, p.y - pa.y)
          : Math.abs((pb.x - pa.x) * (pa.y - p.y) - (pa.x - p.x) * (pb.y - pa.y)) / len;
      if (d > dist) [dist, worst] = [d, i];
    }
    if (worst >= 0 && dist > epsilon) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export const flatten = (points: Point[]) => points.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);

export function unflatten(flat: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

// 付箋全体を囲む矩形（一覧から飛んだときにここへスクロールする）
export function bounds(items: InkItem[]): { x: number; y: number; w: number; h: number } | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const it of items) {
    if (isTextItem(it)) {
      add(it.x, it.y);
      add(it.x + it.w, it.y + it.h);
      if (it.kind === "memo") add(it.px, it.py);
    } else for (const p of unflatten(it.points)) add(p.x, p.y);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ハッシュタグは先頭の # と前後の空白を取り、重複を除く
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const tag = t.trim().replace(/^[#＃]+/, "").trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

// 一覧に出す本文：メモ（囲み）に書いた文字、なければ補足
export function annotationText(a: Pick<Annotation, "items" | "comment">): string {
  const boxText = a.items
    .filter(isTextItem)
    .map((i) => i.text.trim())
    .filter(Boolean)
    .join(" / ");
  return [boxText, a.comment.trim()].filter(Boolean).join(" — ");
}

// ---- 書き込んだ箇所の要素（target） ----
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function selectorOf(root: Element, el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== root && parts.length < 6; e = e.parentElement) {
    const tag = e.tagName.toLowerCase();
    // Mantine が自動で付けるクラス（m_xxx, mantine-xxx, __m__-xxx）は描画のたびに変わりうるので使わない
    const cls = [...e.classList].find((c) => !/^(m_|mantine-|__)/.test(c));
    const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e!.tagName) : [];
    const nth = same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : "";
    parts.unshift(`${tag}${cls ? `.${cls}` : ""}${nth}`);
  }
  return parts.join(" > ");
}

// 押した位置より上にある、いちばん近い見出し（余白を押しても、どの節の話か分かるように）
function sectionAt(root: Element, clientY: number): string {
  let last = "";
  for (const h of root.querySelectorAll("h1, h2, h3, h4")) {
    if (h.closest("[data-annot-ui]")) continue;
    if (h.getBoundingClientRect().top <= clientY) last = h.textContent ?? "";
    else break;
  }
  return clip(last, 40);
}

export function targetAt(root: HTMLElement, clientX: number, clientY: number): Target | undefined {
  const el = document
    .elementsFromPoint(clientX, clientY)
    .find((e) => root.contains(e) && e !== root && !e.closest("[data-annot-ui]"));
  if (!el) return undefined;
  // 文字のない要素（余白・図の線など）は、文字を持つ親まで上がる
  let textEl: Element = el;
  while (!(textEl as HTMLElement).innerText?.trim() && textEl.parentElement && textEl.parentElement !== root) textEl = textEl.parentElement;
  const r = el.getBoundingClientRect();
  const pct = (v: number, len: number) => (len > 0 ? Math.round(Math.min(100, Math.max(0, (v / len) * 100))) : 0);
  return {
    selector: selectorOf(root, el),
    section: sectionAt(root, clientY),
    // 本文全体のような、段落や表をいくつも含む要素の文字は「どこ」の手がかりにならないので、余白として扱う
    text: textEl.querySelectorAll("p, li, tr, h2, h3, h4").length > 2 ? "" : clip((textEl as HTMLElement).innerText ?? "", 80),
    rx: pct(clientX - r.left, r.width),
    ry: pct(clientY - r.top, r.height),
  };
}

// ---- LLM に渡すための書き出し ----
export type ExportContext = { projectName: string; pageTitles: Record<string, string>; pageUrl: (docType: string) => string };

const describe = (t?: Target) =>
  t ? `${t.section ? `見出し「${t.section}」の中、` : ""}${t.text ? `「${t.text}」` : "余白"}（要素内 ${t.rx}%, ${t.ry}% の位置、セレクタ \`${t.selector}\`）` : "（位置の情報なし）";

// 付箋をまとめて、そのままプロンプトに貼れる Markdown にする
export function formatForPrompt(list: Annotation[], ctx: ExportContext, now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });
  const out = [
    `# 提案資料「${ctx.projectName}」への指摘（${list.length} 件）`,
    "",
    `以下は、提案資料サイトの閲覧者がページに書き込んだ指摘です（${fmt.format(now)} 時点）。`,
    "「指している箇所」は、メモの点（または囲み・矢印・手書き）が重なっていた資料の要素です（見出し、要素の文字、要素内の位置、CSS セレクタ）。",
    "",
  ];
  list.forEach((a, n) => {
    const title = ctx.pageTitles[a.docType] ?? a.docType;
    out.push(`## ${n + 1}. ${title}`, "");
    out.push(`- 状態: ${a.status}${a.tags.length ? ` / タグ: ${a.tags.map((t) => `#${t}`).join(" ")}` : ""}`);
    out.push(`- 記入: ${a.authorName}${a.createdAt ? `（${fmt.format(a.createdAt.toDate())}）` : ""}`);
    out.push(`- ページ: ${ctx.pageUrl(a.docType)}`);
    for (const it of a.items) {
      if (it.kind === "memo") out.push(`- 指示: ${it.text.trim() || "（文字なし）"}`, `  - 指している箇所: ${describe(it.target)}`);
      else if (it.kind === "box") out.push(`- 指示: ${it.text.trim() || "（文字なし）"}`, `  - 囲んだ箇所: ${describe(it.target)}`);
      else if (it.kind === "line") out.push(`- 矢印が指している箇所: ${describe(it.target)}`);
    }
    if (!a.items.some((it) => it.kind !== "pen") && a.items.length) out.push(`- 手書きした箇所: ${describe(a.items[0].target)}`);
    if (a.comment.trim()) out.push(`- 補足: ${a.comment.trim()}`);
    out.push("");
  });
  return out.join("\n").trimEnd() + "\n";
}

// ---- 目印（anchor） ----
const MAX_ANCHOR_DEPTH = 6;

// 付箋レイヤー（root）の中で、点の下にある要素を目印にする。深すぎる要素（図の中の部品など）は親で止める
export function anchorAt(root: HTMLElement, clientX: number, clientY: number): Anchor {
  const rootRect = root.getBoundingClientRect();
  const hit = document
    .elementsFromPoint(clientX, clientY)
    .find((el) => root.contains(el) && el !== root && !el.closest("[data-annot-ui]"));
  const path: number[] = [];
  if (hit) {
    let chain: Element[] = [];
    for (let el: Element | null = hit; el && el !== root; el = el.parentElement) chain.unshift(el);
    chain = chain.slice(0, MAX_ANCHOR_DEPTH);
    let parent: Element = root;
    for (const el of chain) {
      path.push(Array.prototype.indexOf.call(parent.children, el));
      parent = el;
    }
  }
  const el = resolveAnchor(root, path);
  const r = el.getBoundingClientRect();
  return { path, left: r.left - rootRect.left, top: r.top - rootRect.top };
}

export function resolveAnchor(root: HTMLElement, path: number[]): Element {
  let el: Element = root;
  for (const i of path) {
    const next = el.children[i];
    if (!next || next.hasAttribute("data-annot-ui")) break;
    el = next;
  }
  return el;
}

// 保存したときの座標を、いまの画面の座標に移す変換（translate + scale）
export function placement(root: HTMLElement, a: Pick<Annotation, "anchor" | "width">) {
  const rootRect = root.getBoundingClientRect();
  const scale = a.width > 0 && rootRect.width > 0 ? rootRect.width / a.width : 1;
  const el = resolveAnchor(root, a.anchor.path);
  const r = el.getBoundingClientRect();
  return {
    scale,
    x: r.left - rootRect.left - a.anchor.left * scale,
    y: r.top - rootRect.top - a.anchor.top * scale,
  };
}

// ---- Firestore ----
const annotationsOf = (db: Firestore, projectId: string) => collection(db, "projects", projectId, "annotations");

// 管理者は案件のすべての付箋を、クライアントは自分の付箋だけを読む（firestore.rules と同じ条件）
export function watchAnnotations(
  db: Firestore,
  projectId: string,
  viewer: { uid: string; isAdmin: boolean },
  onChange: (list: Annotation[]) => void,
  onError: (e: Error) => void,
) {
  const ref = annotationsOf(db, projectId);
  const q = viewer.isAdmin ? ref : query(ref, where("authorUid", "==", viewer.uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Annotation, "id">), id: d.id }));
      // 新しい順。書き込み直後は createdAt がまだ null なので、いちばん新しいものとして扱う
      list.sort((a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity));
      onChange(list);
    },
    onError,
  );
}

export type NewAnnotation = Omit<Annotation, "id" | "createdAt" | "updatedAt" | "status">;

export async function addAnnotation(db: Firestore, projectId: string, a: NewAnnotation) {
  const ref = await addDoc(annotationsOf(db, projectId), {
    ...a,
    tags: normalizeTags(a.tags),
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function updateAnnotation(
  db: Firestore,
  projectId: string,
  id: string,
  patch: Partial<Pick<Annotation, "status" | "tags" | "comment" | "items">>,
) {
  const data = patch.tags ? { ...patch, tags: normalizeTags(patch.tags) } : patch;
  return updateDoc(doc(annotationsOf(db, projectId), id), { ...data, updatedAt: serverTimestamp() });
}

export function deleteAnnotation(db: Firestore, projectId: string, id: string) {
  return deleteDoc(doc(annotationsOf(db, projectId), id));
}
