// ```usecase ブロック（YAML）を React Flow でユースケース図として描画する。
// ER図（色の面で囲んだ表の集まり）やページ遷移図と見分けやすいよう、無地のキャンバスにフラットなチップを並べる:
// 人型のアクターを境界の外に置き、ユースケースは左端にアクターの色を持つ角丸のチップにして、薄い面のシステム境界に入れる。
// 線は細く淡い曲がり線で、アクターから幹が出て枝分かれし、ユースケース側は小さな丸で終わる
import {
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Code, Group, Text, useComputedColorScheme } from "@mantine/core";
import { useMemo, useState } from "react";
import { parseYaml } from "../lib/docs";
import { ACTOR_H, ACTOR_W, CASE_H, CASE_W, layoutUsecase, type UsecaseLayout, type UsecaseSpec } from "../lib/usecase";
import DiagramFrame from "./DiagramFrame";

type Actor = UsecaseLayout["actors"][number];
type Case = UsecaseLayout["cases"][number];

const SIDES = { l: Position.Left, r: Position.Right, t: Position.Top, b: Position.Bottom } as const;

// top: 辺の上での位置（省略すると中央）。アクターはアバターの中心から線を出す
function Handles({ sides, top }: { sides: (keyof typeof SIDES)[]; top?: number }) {
  return (
    <>
      {sides.flatMap((s) =>
        (["s", "t"] as const).map((k) => (
          <Handle key={s + k} id={`${s}:${k}`} type={k === "s" ? "source" : "target"} position={SIDES[s]} isConnectable={false} className="uc-handle" style={top != null ? { top } : undefined} />
        )),
      )}
    </>
  );
}

function ActorNode({ data }: NodeProps<Node<{ actor: Actor }>>) {
  const { actor } = data;
  const color = `var(--mantine-color-${actor.color}-filled)`;
  return (
    <div className="uc-actor" style={{ width: ACTOR_W, height: ACTOR_H }}>
      {/* 人型のアイコン（頭と肩）を丸いアバターに入れる */}
      <div
        className="uc-avatar"
        style={{
          background: `var(--mantine-color-${actor.color}-light)`,
          borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        }}
      >
        <svg width={28} height={28} viewBox="0 0 40 40" aria-hidden>
          <circle cx={20} cy={13} r={7.5} fill="none" stroke={color} strokeWidth={2.4} />
          <path d="M7,36 C7,27 13,23.5 20,23.5 C27,23.5 33,27 33,36" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </svg>
      </div>
      <Text size="sm" fw={600} ta="center" lh={1.3}>{actor.name}</Text>
      {actor.note && <Text size="xs" c="dimmed" ta="center" lh={1.3}>{actor.note}</Text>}
      <Handles sides={[actor.side === "left" ? "r" : "l"]} top={24} />
    </div>
  );
}

function CaseNode({ data }: NodeProps<Node<{ case: Case; accent: string }>>) {
  return (
    <div className="uc-case" style={{ width: CASE_W, minHeight: CASE_H, borderLeftColor: data.accent }}>
      <Text size="xs" fw={600} c="dimmed" className="uc-case-id">{data.case.id}</Text>
      <Text size="sm" fw={500} lh={1.35}>{data.case.name}</Text>
      <Handles sides={["l", "r", "t", "b"]} />
    </div>
  );
}

function SystemNode({ data }: NodeProps<Node<{ name?: string }>>) {
  return (
    <div className="uc-system">
      {data.name && <span className="uc-system-name">{data.name}</span>}
    </div>
  );
}

const nodeTypes = { actor: ActorNode, case: CaseNode, system: SystemNode };

function build(spec: UsecaseSpec, l: UsecaseLayout): { nodes: Node[]; edges: Edge[] } {
  const actorOf = new Map(l.actors.map((a) => [a.id, a]));
  // チップの左端の色。使うアクターが1人ならその色、複数なら無彩色
  const accentOf = (c: Case) => {
    const colors = new Set((c.actors ?? []).map((id) => actorOf.get(id)!.color));
    return colors.size === 1 ? `color-mix(in srgb, var(--mantine-color-${[...colors][0]}-filled) 70%, transparent)` : "var(--mantine-color-gray-5)";
  };
  const nodes: Node[] = [
    {
      id: "system",
      type: "system",
      position: { x: l.boundary.x, y: l.boundary.y },
      width: l.boundary.width,
      height: l.boundary.height,
      data: { name: spec.system },
      selectable: false,
      zIndex: -1,
    },
    ...l.actors.map((a) => ({ id: `actor:${a.id}`, type: "actor", position: { x: a.x, y: a.y }, width: ACTOR_W, height: ACTOR_H, data: { actor: a } })),
    ...l.cases.map((c) => ({
      id: `case:${c.id}`,
      type: "case",
      position: { x: c.x, y: c.y },
      width: CASE_W,
      height: CASE_H,
      data: { case: c, accent: accentOf(c) },
    })),
  ];

  const caseOf = new Map(l.cases.map((c) => [c.id, c]));
  const edges: Edge[] = [];
  for (const c of l.cases) {
    for (const id of c.actors ?? []) {
      const a = actorOf.get(id)!;
      edges.push({
        id: `use:${id}:${c.id}`,
        source: `actor:${id}`,
        target: `case:${c.id}`,
        sourceHandle: a.side === "left" ? "r:s" : "l:s",
        targetHandle: a.side === "left" ? "l:t" : "r:t",
        // アクターのすぐ横で曲げ、1本の幹から枝分かれして見えるようにする
        type: "smoothstep",
        pathOptions: { borderRadius: 12, offset: 24 },
        className: "uc-use",
        style: { stroke: `color-mix(in srgb, var(--mantine-color-${a.color}-filled) 55%, transparent)` },
        markerEnd: `uc-dot-${a.color}`,
      } as Edge);
    }
  }
  for (const r of spec.relations ?? []) {
    const f = caseOf.get(r.from)!;
    const t = caseOf.get(r.to)!;
    // 同じ列なら右の辺どうしを弧で結ぶ（上下に隣り合うと線が短すぎて見えないため）。別の列なら向かい合う辺を結ぶ
    const [fs, ts] = f.x === t.x ? ["r", "r"] : f.x < t.x ? ["r", "l"] : ["l", "r"];
    edges.push({
      id: `rel:${r.from}:${r.to}`,
      source: `case:${r.from}`,
      target: `case:${r.to}`,
      sourceHandle: `${fs}:s`,
      targetHandle: `${ts}:t`,
      type: "default",
      label: r.type,
      className: "uc-rel",
      labelBgPadding: [8, 3],
      labelBgBorderRadius: 999,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--mantine-color-gray-5)" },
    });
  }
  return { nodes, edges };
}

// 線のユースケース側の端に付ける丸（アクターの色ごと）
function Markers({ colors }: { colors: string[] }) {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
      <defs>
        {colors.map((c) => (
          <marker key={c} id={`uc-dot-${c}`} viewBox="0 0 10 10" refX={5} refY={5} markerWidth={7} markerHeight={7} markerUnits="userSpaceOnUse">
            <circle cx={5} cy={5} r={4} fill={`var(--mantine-color-${c}-filled)`} stroke="var(--mantine-color-body)" strokeWidth={1.5} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}

// 選んだアクター・ユースケースとつながるものの id
function related(edges: Edge[], id: string) {
  const set = new Set([id]);
  for (const e of edges) {
    if (e.source === id) set.add(e.target);
    if (e.target === id) set.add(e.source);
  }
  return set;
}

// height が "auto" なら図の縦横比に合わせる（スマホで縦に余白だらけにならないように）
const layoutColors = (nodes: Node[]) => nodes.filter((n) => n.type === "actor").map((n) => (n.data as { actor: Actor }).actor.color);

function Canvas({ spec, height, aspect }: { spec: UsecaseSpec; height: string; aspect: string }) {
  const scheme = useComputedColorScheme("light");
  const rf = useReactFlow();
  const graph = useMemo(() => build(spec, layoutUsecase(spec)), [spec]);
  const [selected, setSelected] = useState<string | null>(null);

  const focus = selected ? related(graph.edges, selected) : null;
  const nodes = graph.nodes.map((n) =>
    n.type === "system" ? n : { ...n, className: focus && !focus.has(n.id) ? "uc-dim" : n.id === selected ? "uc-selected" : undefined },
  );
  const edges = graph.edges.map((e) => ({
    ...e,
    className: [e.className, focus && !(e.source === selected || e.target === selected) ? "uc-dim" : ""].filter(Boolean).join(" "),
  }));
  const current = selected?.startsWith("case:")
    ? spec.cases.find((c) => `case:${c.id}` === selected)
    : spec.actors.find((a) => `actor:${a.id}` === selected);

  return (
    <div className="uc" style={height === "auto" ? { aspectRatio: aspect, maxHeight: "70vh" } : { height }}>
      <Markers colors={[...new Set(layoutColors(graph.nodes))]} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={scheme}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        onInit={() => rf.fitView({ padding: 0.08 })}
        onNodeClick={(_, n) => n.type !== "system" && setSelected(n.id === selected ? null : n.id)}
        onPaneClick={() => setSelected(null)}
        minZoom={0.2}
        maxZoom={2}
      >
        <Controls showInteractive={false} />
        {current && (
          <Panel position="top-left" className="uc-detail">
            <Text size="sm" fw={700}>{"id" in current && selected?.startsWith("case:") ? `${current.id} ${current.name}` : current.name}</Text>
            {current.note && <Text size="xs" c="dimmed">{current.note}</Text>}
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

function Legend({ types }: { types: Set<string> }) {
  const sample = (rel: boolean) => (
    <svg width={40} height={10} aria-hidden>
      <line
        x1={2}
        y1={5}
        x2={rel ? 30 : 34}
        y2={5}
        stroke="var(--mantine-color-gray-5)"
        strokeWidth={1.5}
        strokeDasharray={rel ? "1 4" : undefined}
        strokeLinecap="round"
      />
      {rel ? <path d="M30,1.5 L37,5 L30,8.5 Z" fill="var(--mantine-color-gray-5)" /> : <circle cx={35} cy={5} r={3} fill="var(--mantine-color-gray-5)" />}
    </svg>
  );
  return (
    <Group gap="lg" mt="xs" className="uc-legend">
      <Group gap={6}>{sample(false)}<Text size="xs" c="dimmed">アクターが利用する</Text></Group>
      {types.has("include") && <Group gap={6}>{sample(true)}<Text size="xs" c="dimmed">include：必ず含む</Text></Group>}
      {types.has("extend") && <Group gap={6}>{sample(true)}<Text size="xs" c="dimmed">extend：条件によって追加される</Text></Group>}
    </Group>
  );
}

export default function UsecaseDiagram({ source }: { source: string }) {
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<UsecaseSpec>(source);
      return { spec, layout: layoutUsecase(spec) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);
  if ("error" in parsed) return <Code block c="red">ユースケース図を読めません: {parsed.error}</Code>;
  const { spec, layout } = parsed;
  const types = new Set((spec.relations ?? []).map((r) => r.type));
  const right = Math.max(layout.boundary.x + layout.boundary.width, ...layout.actors.map((a) => a.x + ACTOR_W));
  const bottom = Math.max(layout.boundary.height, ...layout.actors.map((a) => a.y + ACTOR_H));
  const aspect = `${right + 80} / ${bottom + 80}`;
  return (
    <DiagramFrame title="ユースケース図" summary={`アクター ${spec.actors.length} / ユースケース ${spec.cases.length}`} height="auto">
      {(h) => (
        <>
          <Canvas spec={spec} height={h} aspect={aspect} />
          {types.size > 0 && <Legend types={types} />}
        </>
      )}
    </DiagramFrame>
  );
}
