// ```flow ブロック（ページ遷移図）の配置を計算する。
// 区画（現地・事務所など）→ レーン（日常業務・設定など）の中に画面のカードを左から右へ並べる。
// レーンごとに ELK の layered で画面の列を決め、線は自前で描く: 進む線は右辺から左辺への曲線、
// 戻る線（type: back）はカードの下をくぐる点線。区画の間の受け渡し（同期など）は区画をまたぐ帯にする
import ELK from "elkjs/lib/elk.bundled.js";

export type FlowSpec = {
  zones: { id: string; name: string; note?: string; color?: string; footnote?: string; lanes?: { id: string; name: string; note?: string }[] }[];
  screens: { id: string; name: string; zone?: string; lane?: string }[];
  terminals?: { id: string; label: string; zone?: string; lane?: string }[];
  edges?: { from: string; to: string; label?: string; type?: "go" | "back" }[];
  flows?: { from: string; to: string; label: string; note?: string }[];
  notes?: string[];
};

// 寸法。PDF（A4 縦の本文幅）では縮めたときに文字が小さくなりすぎないよう、カードを細くして線の間も詰める
export type FlowDims = { cardW: number; cardH: number; term: number; layerGap: number; nodeGap: number; backDip: number; lanePad: number; noteGap: number; noteW: number; charW: [number, number] };
export const SCREEN_DIMS: FlowDims = { cardW: 196, cardH: 64, term: 48, layerGap: 84, nodeGap: 36, backDip: 34, lanePad: 20, noteGap: 48, noteW: 260, charW: [7, 12] };
export const PRINT_DIMS: FlowDims = { cardW: 124, cardH: 48, term: 40, layerGap: 44, nodeGap: 24, backDip: 26, lanePad: 14, noteGap: 28, noteW: 200, charW: [6, 11] };

const COLORS = ["teal", "indigo", "grape", "orange", "cyan", "pink"];

export type FlowNode = { id: string; kind: "screen" | "terminal"; label: string; x: number; y: number; w: number; h: number; role?: "start" | "end" };
// ラベルは線にかぶせず、線の横の空いている側に置く: (lx, ly) は線の上の点、side はその点から見てラベルを置く側、
// align はラベルのどこを lx に合わせるか（end: 右端。行き先のカードの手前に寄せる）
export type FlowEdge = { id: string; path: string; label?: string; lx: number; ly: number; side: "above" | "below"; align: "center" | "end"; back: boolean };
export type FlowLane = { id: string; name?: string; note?: string; noteX: number; noteW: number; width: number; height: number; nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowZone = { id: string; name: string; note?: string; footnote?: string; color: string; lanes: FlowLane[]; flowAfter?: { label: string; note?: string; up: boolean } };
export type FlowLayout = { zones: FlowZone[]; width: number; hasBack: boolean; hasFlow: boolean; notes: string[] };

type Elk = InstanceType<typeof ELK>;
let elk: Elk | undefined;

// ラベルの幅の見積もり（文字の幅 + 左右の余白）
const labelWidth = (label: string | undefined, [narrow, wide]: [number, number]) =>
  label ? [...label].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x100 ? narrow : wide), 0) + 22 : 0;

const center = (n: FlowNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

function forwardEdge(s: FlowNode, t: FlowNode): Omit<FlowEdge, "id" | "label" | "back"> {
  const a = { x: s.x + s.w, y: center(s).y };
  const b = { x: t.x, y: center(t).y };
  const dx = Math.max(24, (b.x - a.x) / 2);
  const path = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  // まっすぐな線はラベルを真ん中の上に。曲がる線は、行き先の手前の水平な部分の、曲線が来ない側に置く
  // （下っていく線は手前の左上を曲線が通るので下側、上っていく線は上側）
  if (Math.abs(b.y - a.y) < 4) return { path, lx: (a.x + b.x) / 2, ly: (a.y + b.y) / 2, side: "above", align: "center" };
  return { path, lx: b.x - 10, ly: b.y, side: b.y > a.y ? "below" : "above", align: "end" };
}

// 戻る線: 両方のカードの下をくぐって、戻り先のカードの下辺に入る
function backEdge(s: FlowNode, t: FlowNode, bottom: number, dip: number): Omit<FlowEdge, "id" | "label" | "back"> {
  const a = { x: center(s).x, y: s.y + s.h };
  const b = { x: center(t).x, y: t.y + t.h };
  const low = bottom + dip;
  // ラベルは線のいちばん低いところのさらに下に置く
  return { path: `M${a.x},${a.y} C${a.x},${low} ${b.x},${low} ${b.x},${b.y}`, lx: (a.x + b.x) / 2, ly: 0.125 * a.y + 0.75 * low + 0.125 * b.y, side: "below", align: "center" };
}

export async function layoutFlow(spec: FlowSpec, d: FlowDims = SCREEN_DIMS): Promise<FlowLayout> {
  elk ??= new ELK();
  const zoneIds = spec.zones.map((z) => z.id);
  const terminals = spec.terminals ?? [];
  const edges = spec.edges ?? [];
  const placeOf = (n: { zone?: string; lane?: string }) => {
    const zone = spec.zones.find((z) => z.id === n.zone) ?? spec.zones[0];
    const lane = zone.lanes?.find((l) => l.id === n.lane) ?? zone.lanes?.[0];
    return `${zone.id}/${lane?.id ?? ""}`;
  };
  const items = [
    ...spec.screens.map((s) => ({ id: s.id, kind: "screen" as const, label: s.name, place: placeOf(s), w: d.cardW, h: d.cardH })),
    ...terminals.map((t) => ({ id: t.id, kind: "terminal" as const, label: t.label, place: placeOf(t), w: d.term, h: d.term })),
  ];
  const placeById = new Map(items.map((n) => [n.id, n.place]));

  const zones: FlowZone[] = [];
  for (const [zi, z] of spec.zones.entries()) {
    const lanes: FlowLane[] = [];
    for (const lane of z.lanes?.length ? z.lanes : [{ id: "", name: undefined, note: undefined }]) {
      const place = `${z.id}/${lane.id}`;
      const members = items.filter((n) => n.place === place);
      const laneEdges = edges.filter((e) => placeById.get(e.from) === place && placeById.get(e.to) === place && e.from !== e.to);
      const graph = await elk.layout({
        id: place,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.nodeNode": String(d.nodeGap),
          // 列の間はラベルが収まる幅にする（ラベルがカードの下に潜らないように）
          "elk.layered.spacing.nodeNodeBetweenLayers": String(
            Math.max(d.layerGap, ...laneEdges.filter((e) => e.type !== "back").map((e) => labelWidth(e.label, d.charW) + 32)),
          ),
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
          "elk.padding": `[top=${d.lanePad},left=0,bottom=${d.lanePad},right=0]`,
        },
        children: members.map((n) => ({ id: n.id, width: n.w, height: n.h })),
        // 戻る線は配置に使わない（使うと左右が入れ替わる）
        edges: laneEdges.filter((e) => e.type !== "back").map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
      });
      const pos = new Map((graph.children ?? []).map((c) => [c.id, c]));
      const nodes: FlowNode[] = members.map((n) => {
        const p = pos.get(n.id)!;
        const out = laneEdges.some((e) => e.from === n.id);
        const into = laneEdges.some((e) => e.to === n.id);
        return {
          id: n.id,
          kind: n.kind,
          label: n.label,
          x: p.x ?? 0,
          y: p.y ?? 0,
          w: n.w,
          h: n.h,
          role: n.kind === "terminal" ? (out || !into ? "start" : "end") : undefined,
        };
      });
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const bottom = Math.max(0, ...nodes.map((n) => n.y + n.h));
      const hasBack = laneEdges.some((e) => e.type === "back");
      const flowEdges: FlowEdge[] = laneEdges.map((e, i) => {
        const s = byId.get(e.from)!;
        const t = byId.get(e.to)!;
        const back = e.type === "back";
        return { id: `${place}#${i}`, label: e.label, back, ...(back ? backEdge(s, t, bottom, d.backDip) : forwardEdge(s, t)) };
      });
      const right = Math.max(0, ...nodes.map((n) => n.x + n.w));
      lanes.push({
        id: lane.id,
        name: lane.name,
        note: lane.note,
        noteX: right + d.noteGap,
        noteW: d.noteW,
        width: right + (lane.note ? d.noteGap + d.noteW : 0),
        height: bottom + (hasBack ? d.backDip + 34 : 0) + d.lanePad, // 戻る線と、その下のラベルの分
        nodes,
        edges: flowEdges,
      });
    }
    zones.push({ id: z.id, name: z.name, note: z.note, footnote: z.footnote, color: z.color ?? COLORS[zi % COLORS.length], lanes });
  }

  for (const f of spec.flows ?? []) {
    const a = zoneIds.indexOf(f.from);
    const b = zoneIds.indexOf(f.to);
    if (a < 0 || b < 0 || Math.abs(a - b) !== 1) continue;
    zones[Math.min(a, b)].flowAfter = { label: f.label, note: f.note, up: b < a };
  }

  return {
    zones,
    width: Math.max(...zones.flatMap((z) => z.lanes.map((l) => l.width))),
    hasBack: edges.some((e) => e.type === "back"),
    hasFlow: zones.some((z) => z.flowAfter),
    notes: spec.notes ?? [],
  };
}
