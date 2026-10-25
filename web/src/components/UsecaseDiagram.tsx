// ```usecase ブロック（YAML）を React Flow でユースケース図として描画する。
// ER図（色の面で囲んだ表の集まり）やページ遷移図と見分けやすいよう、UML のユースケース図に近い表現にする:
// 人型のアクターを境界の外に置き、楕円のユースケースを無地のシステム境界で囲む。線は矢印なしの細い実線
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

function Handles({ sides }: { sides: (keyof typeof SIDES)[] }) {
  return (
    <>
      {sides.flatMap((s) =>
        (["s", "t"] as const).map((k) => (
          <Handle key={s + k} id={`${s}:${k}`} type={k === "s" ? "source" : "target"} position={SIDES[s]} isConnectable={false} className="uc-handle" />
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
      {/* 人型のアイコン（頭と肩） */}
      <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden>
        <circle cx={20} cy={12} r={8} fill="none" stroke={color} strokeWidth={2} />
        <path d="M5,38 C5,27 12,23 20,23 C28,23 35,27 35,38" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </svg>
      <Text size="sm" fw={700} ta="center" lh={1.3}>{actor.name}</Text>
      {actor.note && <Text size="xs" c="dimmed" ta="center" lh={1.3}>{actor.note}</Text>}
      <Handles sides={[actor.side === "left" ? "r" : "l"]} />
    </div>
  );
}

function CaseNode({ data }: NodeProps<Node<{ case: Case }>>) {
  return (
    <div className="uc-case" style={{ width: CASE_W, height: CASE_H }}>
      <Text size="sm" fw={500} ta="center" lh={1.35}>{data.case.name}</Text>
      <Handles sides={["l", "r", "t", "b"]} />
    </div>
  );
}

function SystemNode({ data }: NodeProps<Node<{ name?: string }>>) {
  return (
    <div className="uc-system">
      {data.name && <Text size="sm" fw={700} className="uc-system-name">{data.name}</Text>}
    </div>
  );
}

const nodeTypes = { actor: ActorNode, case: CaseNode, system: SystemNode };

function build(spec: UsecaseSpec, l: UsecaseLayout): { nodes: Node[]; edges: Edge[] } {
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
    ...l.cases.map((c) => ({ id: `case:${c.id}`, type: "case", position: { x: c.x, y: c.y }, width: CASE_W, height: CASE_H, data: { case: c } })),
  ];

  const actorOf = new Map(l.actors.map((a) => [a.id, a]));
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
        type: "straight",
        style: { stroke: `var(--mantine-color-${a.color}-filled)`, strokeWidth: 1.5 },
      });
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
      label: `«${r.type}»`,
      className: "uc-rel",
      labelBgPadding: [6, 2],
      labelBgBorderRadius: 4,
      style: { strokeDasharray: "6 4", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.Arrow, width: 18, height: 18 },
    });
  }
  return { nodes, edges };
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
  const line = (dashed: boolean) => (
    <svg width={36} height={10} aria-hidden>
      <line x1={2} y1={5} x2={dashed ? 28 : 34} y2={5} stroke="var(--mantine-color-dimmed)" strokeWidth={1.5} strokeDasharray={dashed ? "5 3" : undefined} />
      {dashed && <path d="M27,1 L34,5 L27,9" fill="none" stroke="var(--mantine-color-dimmed)" strokeWidth={1.5} />}
    </svg>
  );
  return (
    <Group gap="lg" mt="xs" className="uc-legend">
      <Group gap={6}>{line(false)}<Text size="xs" c="dimmed">アクターが利用する</Text></Group>
      {types.has("include") && <Group gap={6}>{line(true)}<Text size="xs" c="dimmed">«include» 必ず含む</Text></Group>}
      {types.has("extend") && <Group gap={6}>{line(true)}<Text size="xs" c="dimmed">«extend» 条件によって追加される</Text></Group>}
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
