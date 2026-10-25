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

export const CARD_W = 196;
export const CARD_H = 64;
export const TERM = 48;
const LAYER_GAP = 84; // 線のラベルが入る分
const NODE_GAP = 36;
const BACK_DIP = 34; // 戻る線がカードの下をくぐる深さ
const LANE_PAD = 20;
const NOTE_GAP = 48;
export const NOTE_W = 260;

const COLORS = ["teal", "indigo", "grape", "orange", "cyan", "pink"];

export type FlowNode = { id: string; kind: "screen" | "terminal"; label: string; x: number; y: number; w: number; h: number; role?: "start" | "end" };
export type FlowEdge = { id: string; path: string; label?: string; lx: number; ly: number; back: boolean };
export type FlowLane = { id: string; name?: string; note?: string; noteX: number; width: number; height: number; nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowZone = { id: string; name: string; note?: string; footnote?: string; color: string; lanes: FlowLane[]; flowAfter?: { label: string; note?: string; up: boolean } };
export type FlowLayout = { zones: FlowZone[]; width: number; hasBack: boolean; hasFlow: boolean; notes: string[] };

type Elk = InstanceType<typeof ELK>;
let elk: Elk | undefined;

const center = (n: FlowNode) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

function forwardEdge(s: FlowNode, t: FlowNode): Omit<FlowEdge, "id" | "label" | "back"> {
  const a = { x: s.x + s.w, y: center(s).y };
  const b = { x: t.x, y: center(t).y };
  const dx = Math.max(24, (b.x - a.x) / 2);
  return { path: `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`, lx: (a.x + b.x) / 2, ly: (a.y + b.y) / 2 };
}

// 戻る線: 両方のカードの下をくぐって、戻り先のカードの下辺に入る
function backEdge(s: FlowNode, t: FlowNode, bottom: number): Omit<FlowEdge, "id" | "label" | "back"> {
  const a = { x: center(s).x, y: s.y + s.h };
  const b = { x: center(t).x, y: t.y + t.h };
  const low = bottom + BACK_DIP;
  return { path: `M${a.x},${a.y} C${a.x},${low} ${b.x},${low} ${b.x},${b.y}`, lx: (a.x + b.x) / 2, ly: 0.125 * a.y + 0.75 * low + 0.125 * b.y };
}

export async function layoutFlow(spec: FlowSpec): Promise<FlowLayout> {
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
    ...spec.screens.map((s) => ({ id: s.id, kind: "screen" as const, label: s.name, place: placeOf(s), w: CARD_W, h: CARD_H })),
    ...terminals.map((t) => ({ id: t.id, kind: "terminal" as const, label: t.label, place: placeOf(t), w: TERM, h: TERM })),
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
          "elk.spacing.nodeNode": String(NODE_GAP),
          "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
          "elk.padding": `[top=${LANE_PAD},left=0,bottom=${LANE_PAD},right=0]`,
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
        return { id: `${place}#${i}`, label: e.label, back, ...(back ? backEdge(s, t, bottom) : forwardEdge(s, t)) };
      });
      const right = Math.max(0, ...nodes.map((n) => n.x + n.w));
      lanes.push({
        id: lane.id,
        name: lane.name,
        note: lane.note,
        noteX: right + NOTE_GAP,
        width: right + (lane.note ? NOTE_GAP + NOTE_W : 0),
        height: bottom + (hasBack ? BACK_DIP + 12 : 0) + LANE_PAD,
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
