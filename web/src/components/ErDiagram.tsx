// ```er ブロック（YAML）を React Flow で描画する。配置は ELK で自動計算する。
// ドメインごとに枠でまとめ、枠の中は外部キーの向きに左から右へ並べる。
// ユースケース図（カード）やページ遷移図（色の面とタイル）と見分けやすいよう、技術文書らしい青図（Blueprint）の見た目にする:
// 方眼の地に点線のドメイン枠、細い罫線のテーブル、等幅の列名。ライトでは方眼紙、ダークでは青焼き風になる
// React Flow と ELK は大きいので、Markdown.tsx から遅延読み込みする
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Code,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { parseYaml } from "../lib/docs";
import { PENDING, usePrint } from "../lib/print";
import DiagramFrame from "./DiagramFrame";
import { buildErModel, matchesQuery, neighbors, type ErModel, type ErSpec, type ErTableSpec } from "../lib/er";

const NODE_W = 250;
const HEADER_H = 40;
const ROW_H = 24;
const elk = new ELK();

type TableData = { table: ErTableSpec; color: string; columns: ErTableSpec["columns"]; keys: Set<string> };
type DomainData = { name: string; color: string };

function nodeHeight(columns: number) {
  return HEADER_H + columns * ROW_H + 6;
}

function TableNode({ data }: NodeProps<Node<TableData>>) {
  const { table, color, columns, keys } = data;
  return (
    <div className="er-table" style={{ width: NODE_W, "--er-domain": `var(--mantine-color-${color}-filled)` } as React.CSSProperties}>
      <div className="er-table-head">
        <span className="er-table-name">{table.name}</span>
        {table.label && <span className="er-table-label">{table.label}</span>}
      </div>
      {columns.map((c, i) => (
        <div key={c.name} className="er-col" style={{ height: ROW_H }}>
          <span className="er-key">{c.pk ? "PK" : c.fk ? "FK" : ""}</span>
          <span className="er-col-name" style={{ fontWeight: c.pk ? 700 : undefined }}>
            {c.name}
            {c.nullable ? "?" : ""}
          </span>
          <span className="er-col-type">{c.type}</span>
          {keys.has(c.name) &&
            (["l", "r"] as const).flatMap((side) =>
              (["s", "t"] as const).map((kind) => (
                <Handle
                  key={side + kind}
                  id={`${c.name}:${side}:${kind}`}
                  type={kind === "s" ? "source" : "target"}
                  position={side === "l" ? Position.Left : Position.Right}
                  isConnectable={false}
                  style={{ top: HEADER_H + i * ROW_H + ROW_H / 2 }}
                  className="er-handle"
                />
              )),
            )}
        </div>
      ))}
    </div>
  );
}

function DomainNode({ data }: NodeProps<Node<DomainData>>) {
  return (
    <div className="er-domain" style={{ "--er-domain": `var(--mantine-color-${data.color}-filled)` } as React.CSSProperties}>
      <span className="er-domain-tag">{data.name}</span>
    </div>
  );
}

const nodeTypes = { table: TableNode, domain: DomainNode };

type Layout = { nodes: Node[]; edges: Edge[] };

async function layout(model: ErModel, visible: Set<string>, keyOnly: boolean): Promise<Layout> {
  const referenced = new Set(model.relations.map((r) => `${r.to}.${r.toColumn}`));
  const columnsOf = (t: ErTableSpec) =>
    keyOnly ? t.columns.filter((c) => c.pk || c.fk || referenced.has(`${t.name}.${c.name}`)) : t.columns;
  const tables = model.tables.filter((t) => visible.has(t.name));
  const domainOf = new Map(tables.map((t) => [t.name, t.domain]));
  const relations = model.relations.filter((r) => visible.has(r.from) && visible.has(r.to));

  const graph = await elk.layout({
    id: "root",
    layoutOptions: { "elk.algorithm": "rectpacking", "elk.spacing.nodeNode": "48", "elk.padding": "[top=0,left=0,bottom=0,right=0]" },
    children: model.domains
      .filter((d) => tables.some((t) => t.domain === d.id))
      .map((d) => ({
        id: `domain:${d.id}`,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "LEFT", // 参照される側（マスタ）を右に置く
          "elk.padding": "[top=44,left=24,bottom=24,right=24]",
          "elk.spacing.nodeNode": "28",
          "elk.layered.spacing.nodeNodeBetweenLayers": "70",
          "elk.aspectRatio": "1.6",
        },
        children: tables
          .filter((t) => t.domain === d.id)
          .map((t) => ({ id: t.name, width: NODE_W, height: nodeHeight(columnsOf(t).length) })),
        edges: relations
          .filter((r) => domainOf.get(r.from) === d.id && domainOf.get(r.to) === d.id && r.from !== r.to)
          .map((r) => ({ id: r.id, sources: [r.to], targets: [r.from] })),
      })),
  });

  const nodes: Node[] = [];
  const absX = new Map<string, number>();
  for (const g of graph.children ?? []) {
    const domain = model.domains.find((d) => `domain:${d.id}` === g.id)!;
    nodes.push({
      id: g.id,
      type: "domain",
      position: { x: g.x ?? 0, y: g.y ?? 0 },
      data: { name: domain.name, color: domain.color },
      width: g.width, // 寸法を渡しておくとミニマップにも描かれる
      height: g.height,
      selectable: false,
      zIndex: -1,
    });
    for (const c of g.children ?? []) {
      const table = model.tables.find((t) => t.name === c.id)!;
      const columns = columnsOf(table);
      const keys = new Set(columns.filter((col) => col.pk || col.fk || referenced.has(`${table.name}.${col.name}`)).map((col) => col.name));
      absX.set(c.id, (g.x ?? 0) + (c.x ?? 0));
      nodes.push({
        id: c.id,
        type: "table",
        parentId: g.id,
        position: { x: c.x ?? 0, y: c.y ?? 0 },
        width: c.width,
        height: c.height,
        data: { table, color: domain.color, columns, keys },
      });
    }
  }

  // 位置関係から、線を列の左右どちらから出すかを決める
  const edges: Edge[] = relations.map((r) => {
    const fx = absX.get(r.from)!;
    const tx = absX.get(r.to)!;
    let [fs, ts] = ["r", "l"];
    if (tx + NODE_W < fx) [fs, ts] = ["l", "r"];
    else if (Math.abs(tx - fx) < NODE_W) [fs, ts] = ["r", "r"];
    return {
      id: r.id,
      source: r.from,
      target: r.to,
      sourceHandle: `${r.fromColumn}:${fs}:s`,
      targetHandle: `${r.toColumn}:${ts}:t`,
      type: "smoothstep",
      markerStart: r.oneToOne ? (r.optional ? "er-zero-one" : "er-one") : r.optional ? "er-zero-many" : "er-many",
      markerEnd: "er-one",
      pathOptions: { borderRadius: 8 },
    } as Edge;
  });
  return { nodes, edges };
}

// 鳥の足記法のマーカー（x=22 がテーブル側の端）
function Markers() {
  const stroke = "var(--bp-line)";
  const common = { markerWidth: 22, markerHeight: 22, viewBox: "0 0 22 22", refX: 22, refY: 11, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" };
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <marker id="er-one" {...common}>
          <path d="M0,11 H22 M9,4 V18 M14,4 V18" style={{ stroke, fill: "none" }} strokeWidth={1.4} />
        </marker>
        <marker id="er-zero-one" {...common}>
          <path d="M0,11 H22 M16,4 V18" style={{ stroke, fill: "none" }} strokeWidth={1.4} />
          <circle cx={7} cy={11} r={4} style={{ stroke, fill: "var(--bp-bg)" }} strokeWidth={1.4} />
        </marker>
        <marker id="er-many" {...common}>
          <path d="M0,11 H22 M22,3 L12,11 L22,19 M8,4 V18" style={{ stroke, fill: "none" }} strokeWidth={1.4} />
        </marker>
        <marker id="er-zero-many" {...common}>
          <path d="M0,11 H22 M22,3 L12,11 L22,19" style={{ stroke, fill: "none" }} strokeWidth={1.4} />
          <circle cx={7} cy={11} r={4} style={{ stroke, fill: "var(--bp-bg)" }} strokeWidth={1.4} />
        </marker>
      </defs>
    </svg>
  );
}

function TableDetail({ table }: { table: ErTableSpec }) {
  return (
    <Stack gap={4}>
      <Text fw={700} size="sm">{table.name}{table.label && `（${table.label}）`}</Text>
      {table.note && <Text size="xs" c="dimmed">{table.note}</Text>}
      <Table fz="xs" verticalSpacing={2} horizontalSpacing={4}>
        <Table.Tbody>
          {table.columns.map((c) => (
            <Table.Tr key={c.name}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                {c.pk && <Badge size="xs" mr={4}>PK</Badge>}
                {c.fk && <Badge size="xs" color="gray" mr={4}>FK</Badge>}
                {c.name}
              </Table.Td>
              <Table.Td c="dimmed">{c.type}{c.nullable ? "?" : ""}</Table.Td>
              <Table.Td>{c.fk ? `→ ${c.fk}` : c.note}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function Explorer({ model, height }: { model: ErModel; height: string }) {
  const theme = useMantineTheme();
  const scheme = useComputedColorScheme("light");
  const rf = useReactFlow();
  const print = usePrint();
  const [fitted, setFitted] = useState(false);
  const many = model.tables.length > 30;
  const [domains, setDomains] = useState<string[]>(model.domains.map((d) => d.id));
  const [withRelated, setWithRelated] = useState(true);
  const [keyOnly, setKeyOnly] = useState(many);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [graph, setGraph] = useState<Layout | null>(null);
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    const set = new Set(model.tables.filter((t) => domains.includes(t.domain)).map((t) => t.name));
    if (withRelated) {
      for (const r of model.relations) {
        if (set.has(r.from)) set.add(r.to);
        else if (set.has(r.to)) set.add(r.from);
      }
    }
    return set;
  }, [model, domains, withRelated]);

  useEffect(() => {
    let cancelled = false;
    layout(model, visible, keyOnly)
      .then((g) => {
        if (cancelled) return;
        setGraph(g);
        // 新しいノードの描画を待つ。PDF では動かさずに収め、収まってから印刷する
        setTimeout(() => rf.fitView({ padding: 0.05, duration: print ? 0 : 300 }).then(() => setFitted(true)), 50);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [model, visible, keyOnly, rf, print]);

  const focus = selected ? neighbors(model, selected) : null;
  const nodes = useMemo(
    () =>
      (graph?.nodes ?? []).map((n) =>
        n.type === "table" ? { ...n, className: focus && !focus.has(n.id) ? "er-dim" : n.id === selected ? "er-selected" : undefined } : n,
      ),
    [graph, focus, selected],
  );
  const edges = useMemo(
    () =>
      (graph?.edges ?? []).map((e) => {
        const on = selected && (e.source === selected || e.target === selected);
        return { ...e, animated: !!on, className: selected ? (on ? "er-edge-on" : "er-dim") : undefined };
      }),
    [graph, selected],
  );

  const select = (name: string) => {
    setSelected(name);
    if (!visible.has(name)) setDomains((d) => [...d, model.tables.find((t) => t.name === name)!.domain]);
    else rf.fitView({ nodes: [{ id: name }], duration: 400, maxZoom: 1.1, padding: 0.6 });
  };

  const colorOf = (domain: string) => model.domains.find((d) => d.id === domain)?.color ?? "gray";
  const hits = model.tables.filter((t) => matchesQuery(t, query));
  const current = model.tables.find((t) => t.name === selected);

  if (error) return <Code block c="red">{error}</Code>;

  return (
    <div className="er er-bp" style={{ height }} {...(print && !fitted ? PENDING : {})}>
      <Markers />
      {!print && (
      <Stack className="er-side" gap="xs">
        <TextInput size="xs" placeholder="テーブル・列を検索" value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Chip.Group multiple value={domains} onChange={setDomains}>
          <Group gap={4}>
            {model.domains.map((d) => (
              <Chip key={d.id} value={d.id} size="xs" color={d.color}>{d.name}</Chip>
            ))}
          </Group>
        </Chip.Group>
        <Group gap="xs">
          <Button size="compact-xs" variant="default" onClick={() => setDomains(model.domains.map((d) => d.id))}>全ドメイン</Button>
          <Button size="compact-xs" variant="default" onClick={() => setDomains([])}>解除</Button>
        </Group>
        <Switch size="xs" label="キー列だけ表示" checked={keyOnly} onChange={(e) => setKeyOnly(e.currentTarget.checked)} />
        <Checkbox size="xs" label="関連する他ドメインのテーブルも表示" checked={withRelated} onChange={(e) => setWithRelated(e.currentTarget.checked)} />
        <Text size="xs" c="dimmed">{hits.length} / {model.tables.length} テーブル</Text>
        <ScrollArea style={{ flex: 1 }} type="auto">
          {hits.map((t) => (
            <UnstyledButton key={t.name} className="er-item" data-active={t.name === selected || undefined} onClick={() => select(t.name)}>
              <span className="er-dot" style={{ background: `var(--mantine-color-${colorOf(t.domain)}-filled)` }} />
              <Text size="xs" truncate>{t.name}</Text>
              {t.label && <Text size="xs" c="dimmed" truncate>{t.label}</Text>}
            </UnstyledButton>
          ))}
        </ScrollArea>
        {current && (
          <Box className="er-detail">
            <ScrollArea.Autosize mah={240}>
              <TableDetail table={current} />
            </ScrollArea.Autosize>
          </Box>
        )}
      </Stack>
      )}
      <div className="er-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={scheme}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, n) => n.type === "table" && setSelected(n.id === selected ? null : n.id)}
          onPaneClick={() => setSelected(null)}
          minZoom={0.05}
          maxZoom={2}
          onlyRenderVisibleElements={!print}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} />
          {!print && <Controls showInteractive={false} />}
          {!print && model.tables.length > 15 && ( // 小さい図ではミニマップが本体を隠すだけなので出さない
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === "domain" ? "transparent" : theme.colors[(n.data as TableData).color]?.[5] ?? theme.colors.gray[5])}
            nodeStrokeColor={(n) => (n.type === "domain" ? theme.colors[(n.data as DomainData).color]?.[4] ?? theme.colors.gray[4] : "transparent")}
          />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function ErDiagram({ source }: { source: string }) {
  const parsed = useMemo(() => {
    try {
      return { model: buildErModel(parseYaml<ErSpec>(source)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  if ("error" in parsed) return <Code block c="red">ER図を読めません: {parsed.error}</Code>;
  const { model } = parsed;

  return (
    <DiagramFrame
      title="ER図"
      summary={`${model.tables.length} テーブル / ${model.relations.length} リレーション / ${model.domains.length} ドメイン`}
      height="min(75vh, 620px)"
      printHeight="170mm"
    >
      {(height) => <Explorer model={model} height={height} />}
    </DiagramFrame>
  );
}
