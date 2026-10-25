// ```arch ブロック（システム構成図）の配置を計算する。
// 区画（利用者の端末・クラウド・外部サービスなど）を上から下へ帯として重ね、帯の中にカードを左から右へ並べる。
// 帯の中は ELK の layered で配置し、帯をまたぐ線は帯の間のすき間に段（トラック）を作って直角に引く。
// 隣り合わない帯どうしの線は、図の右の余白を通す
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";

export type ArchKind = "user" | "device" | "web" | "app" | "server" | "function" | "db" | "storage" | "auth" | "queue" | "mail" | "external" | "batch";

export type ArchSpec = {
  zones: { id: string; name: string; note?: string; color?: string; external?: boolean }[];
  nodes: { id: string; name: string; kind?: ArchKind; tech?: string; note?: string; zone?: string }[];
  links?: { from: string; to: string; label?: string; type?: "sync" | "async"; both?: boolean }[];
  notes?: string[];
};

const NODE_W = 196;
const NODE_H = 58;
const NOTE_H = 18;
const USER_W = 132;
const USER_H = 48;
const PAD = { top: 52, side: 24, bottom: 22 };
const TRACK = 26; // 帯の間の線の段の間隔（ラベルが重ならない高さ）
const GUTTER = 18; // 右の余白の線の間隔
const MIN_W = 640;

const COLORS = ["teal", "blue", "grape", "orange", "cyan", "pink"];

type Pt = { x: number; y: number };
type SpecNode = ArchSpec["nodes"][number];
type SpecLink = NonNullable<ArchSpec["links"]>[number];
export type ArchNode = SpecNode & { x: number; y: number; w: number; h: number; color: string; kind: ArchKind; external: boolean };
export type ArchZone = { id: string; name: string; note?: string; color: string; external: boolean; x: number; y: number; w: number; h: number };
export type ArchLink = { id: string; points: Pt[]; label?: string; lx?: number; ly?: number; anchor: "center" | "start"; async: boolean; both: boolean };
export type ArchLayout = { zones: ArchZone[]; nodes: ArchNode[]; links: ArchLink[]; width: number; height: number; hasAsync: boolean; notes: string[] };

type Elk = InstanceType<typeof ELK>;
let elk: Elk | undefined;

// 日本語は1文字おおよそ 12px、英数字は 7px で見積もる
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) < 0x100 ? 7 : 12;
  return w;
}

// ある辺に複数の線がつくとき、相手の位置の順に辺の上で等間隔に分ける
function spread<T>(items: T[], key: (t: T) => number, from: number, width: number): Map<T, number> {
  const sorted = [...items].sort((a, b) => key(a) - key(b));
  return new Map(sorted.map((t, i) => [t, from + (width * (i + 1)) / (sorted.length + 1)]));
}

type Indexed = { l: SpecLink; i: number };
type Placed = { nodes: ArchNode[]; inner: { id: string; points: Pt[]; label?: Pt }[]; width: number; height: number };

// narrow: スマホで資料を見るとき。最小幅をなくして、縮小を抑える
// （カードを折り返すと、帯をまたぐ線が上の段のカードの下をくぐってしまうので折り返さない）
export async function layoutArch(spec: ArchSpec, narrow = false): Promise<ArchLayout> {
  elk ??= new ELK();
  const zoneIds = spec.zones.map((z) => z.id);
  const zoneOf = (n: SpecNode) => (n.zone && zoneIds.includes(n.zone) ? n.zone : zoneIds[0]);
  const colorOf = new Map(spec.zones.map((z, i) => [z.id, z.color ?? COLORS[i % COLORS.length]]));
  const ids = new Set(spec.nodes.map((n) => n.id));
  const links: Indexed[] = (spec.links ?? []).filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to).map((l, i) => ({ l, i }));
  const zi = new Map(spec.nodes.map((n) => [n.id, zoneIds.indexOf(zoneOf(n))]));
  const from = (c: Indexed) => zi.get(c.l.from)!;
  const to = (c: Indexed) => zi.get(c.l.to)!;

  const size = (n: SpecNode) =>
    n.kind === "user"
      ? { width: Math.max(USER_W, textWidth(n.name) + 64), height: USER_H }
      : { width: NODE_W, height: NODE_H + (n.note ? NOTE_H : 0) };

  // 1. 帯ごとに中を配置する（つながりのないカードは横に並べる）
  const placed: Placed[] = [];
  for (const [index, z] of spec.zones.entries()) {
    const members = spec.nodes.filter((n) => zoneOf(n) === z.id);
    const inner = links.filter((c) => from(c) === index && to(c) === index);
    const input: ElkNode = {
      id: z.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": "56",
        "elk.spacing.componentComponent": "24",
        "elk.aspectRatio": "20", // つながりのないまとまりを横に並べる
        "elk.edgeLabels.placement": "CENTER",
        "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      },
      children: members.map((n) => ({ id: n.id, ...size(n) })),
      edges: inner.map(({ l, i }) => ({
        id: `l${i}`,
        sources: [l.from],
        targets: [l.to],
        labels: l.label ? [{ text: l.label, width: textWidth(l.label) + 8, height: 18 }] : [],
      })),
    };
    const g = await elk.layout(input);
    const pos = new Map((g.children ?? []).map((c) => [c.id, c]));
    const nodes = members.map((n) => {
      const c = pos.get(n.id)!;
      return { ...n, kind: n.kind ?? "server", color: colorOf.get(z.id)!, external: !!z.external, x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 };
    });
    placed.push({
      nodes,
      inner: (g.edges ?? []).map((e) => {
        const s = e.sections?.[0];
        const lab = e.labels?.[0];
        return {
          id: e.id,
          points: s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : [],
          label: lab ? { x: (lab.x ?? 0) + (lab.width ?? 0) / 2, y: (lab.y ?? 0) + (lab.height ?? 0) / 2 } : undefined,
        };
      }),
      width: Math.max(0, ...nodes.map((n) => n.x + n.w)),
      height: Math.max(USER_H, ...nodes.map((n) => n.y + n.h)),
    });
  }

  // 2. 帯をまたぐ線を、どの帯の間（gap）を通るかで分ける。隣り合わない帯どうしは右の余白へ
  const adjacent = links.filter((c) => Math.abs(to(c) - from(c)) === 1);
  const far = links.filter((c) => Math.abs(to(c) - from(c)) > 1);
  const gapOf = (c: Indexed) => Math.min(to(c), from(c));

  // 3. 帯を上から重ねる
  const contentW = Math.max(
    narrow ? 0 : MIN_W - 2 * PAD.side,
    ...placed.map((p) => p.width),
    ...spec.zones.map((z) => textWidth(z.name + (z.note ?? "")) + 60),
  );
  const zoneW = contentW + 2 * PAD.side;
  const zones: ArchZone[] = [];
  const nodes: ArchNode[] = [];
  const out: ArchLink[] = [];
  const gapTop: number[] = [];
  let y = 0;
  spec.zones.forEach((z, index) => {
    const p = placed[index];
    const h = PAD.top + p.height + PAD.bottom;
    zones.push({ id: z.id, name: z.name, note: z.note, color: colorOf.get(z.id)!, external: !!z.external, x: 0, y, w: zoneW, h });
    const ox = PAD.side;
    const oy = y + PAD.top;
    for (const n of p.nodes) nodes.push({ ...n, x: n.x + ox, y: n.y + oy });
    for (const e of p.inner) {
      const l = links.find((c) => `l${c.i}` === e.id)!.l;
      out.push({
        id: e.id,
        points: e.points.map((q) => ({ x: q.x + ox, y: q.y + oy })),
        label: l.label,
        lx: e.label && e.label.x + ox,
        ly: e.label && e.label.y + oy,
        anchor: "center",
        async: l.type === "async",
        both: !!l.both,
      });
    }
    y += h;
    gapTop.push(y);
    const tracks = adjacent.filter((c) => gapOf(c) === index).length;
    if (index < spec.zones.length - 1) y += Math.max(40, (tracks + 1) * TRACK);
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 4. 隣り合う帯の間の線: 出る辺・入る辺の上で位置を分け、すき間の段で横に渡る
  const port = new Map<string, number>();
  for (const n of nodes) {
    for (const end of ["s", "t"] as const) {
      for (const down of [true, false]) {
        const mine = adjacent.filter((c) => (end === "s" ? c.l.from : c.l.to) === n.id && to(c) > from(c) === down);
        const other = (c: Indexed) => byId.get(end === "s" ? c.l.to : c.l.from)!;
        for (const [c, x] of spread(mine, (c) => other(c).x + other(c).w / 2, n.x, n.w)) port.set(`${c.i}:${end}`, x);
      }
    }
  }
  spec.zones.forEach((_, gi) => {
    const mine = adjacent.filter((c) => gapOf(c) === gi).sort((a, b) => port.get(`${a.i}:s`)! - port.get(`${b.i}:s`)!);
    mine.forEach((c, k) => {
      const s = byId.get(c.l.from)!;
      const t = byId.get(c.l.to)!;
      const down = to(c) > from(c);
      const sx = port.get(`${c.i}:s`)!;
      const tx = port.get(`${c.i}:t`)!;
      const ty = gapTop[gi] + (k + 1) * TRACK - 4;
      const a = { x: sx, y: down ? s.y + s.h : s.y };
      const b = { x: tx, y: down ? t.y : t.y + t.h };
      const straight = Math.abs(sx - tx) < 2;
      out.push({
        id: `l${c.i}`,
        points: straight ? [a, b] : [a, { x: sx, y: ty }, { x: tx, y: ty }, b],
        label: c.l.label,
        // ラベルは段の横線の上（まっすぐな線なら線の右）に置く
        lx: straight ? sx + 8 : (sx + tx) / 2,
        ly: ty,
        anchor: straight ? "start" : "center",
        async: c.l.type === "async",
        both: !!c.l.both,
      });
    });
  });

  // 5. 隣り合わない帯どうし: カードの右辺から図の右の余白を通す
  far.forEach((c, k) => {
    const s = byId.get(c.l.from)!;
    const t = byId.get(c.l.to)!;
    const gx = zoneW + GUTTER * (k + 1);
    const a = { x: s.x + s.w, y: s.y + s.h / 2 };
    const b = { x: t.x + t.w, y: t.y + t.h / 2 };
    out.push({
      id: `l${c.i}`,
      points: [a, { x: gx, y: a.y }, { x: gx, y: b.y }, b],
      label: c.l.label,
      lx: gx + 6,
      ly: (a.y + b.y) / 2,
      anchor: "start",
      async: c.l.type === "async",
      both: !!c.l.both,
    });
  });

  const farW = far.length ? GUTTER * (far.length + 1) + Math.max(0, ...far.map((c) => textWidth(c.l.label ?? ""))) : 0;
  return {
    zones,
    nodes,
    links: out,
    width: zoneW + farW,
    height: y,
    hasAsync: links.some((c) => c.l.type === "async"),
    notes: spec.notes ?? [],
  };
}

// 直角の折れ線を、角を丸めた path にする
export function roundedPath(points: Pt[], r = 8): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const r1 = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const p1 = { x: b.x - Math.sign(b.x - a.x) * r1, y: b.y - Math.sign(b.y - a.y) * r1 };
    const p2 = { x: b.x + Math.sign(c.x - b.x) * r1, y: b.y + Math.sign(c.y - b.y) * r1 };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}
