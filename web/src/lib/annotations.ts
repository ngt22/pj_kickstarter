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

// Firestore は配列の中に配列を持てないので、点の列は [x0, y0, x1, y1, ...] の平らな配列にする
export type PenItem = { kind: "pen"; color: InkColor; width: number; points: number[] };
export type BoxItem = { kind: "box"; color: InkColor; x: number; y: number; w: number; h: number; text: string };
// 引出線：points[0..1] が指している箇所（矢じり側）、points[2..3] が引き出した先
export type LineItem = { kind: "line"; color: InkColor; points: number[] };
export type InkItem = PenItem | BoxItem | LineItem;

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
    if (it.kind === "box") {
      add(it.x, it.y);
      add(it.x + it.w, it.y + it.h);
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

// 一覧に出す本文：囲みに書いた文字、なければ補足
export function annotationText(a: Pick<Annotation, "items" | "comment">): string {
  const boxText = a.items
    .filter((i): i is BoxItem => i.kind === "box")
    .map((i) => i.text.trim())
    .filter(Boolean)
    .join(" / ");
  return [boxText, a.comment.trim()].filter(Boolean).join(" — ");
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
  patch: Partial<Pick<Annotation, "status" | "tags" | "comment">>,
) {
  const data = patch.tags ? { ...patch, tags: normalizeTags(patch.tags) } : patch;
  return updateDoc(doc(annotationsOf(db, projectId), id), { ...data, updatedAt: serverTimestamp() });
}

export function deleteAnnotation(db: Firestore, projectId: string, id: string) {
  return deleteDoc(doc(annotationsOf(db, projectId), id));
}
