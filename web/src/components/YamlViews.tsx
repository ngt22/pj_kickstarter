import { Badge, Code, List, Table, Text } from "@mantine/core";

type Glossary = { terms: { term: string; reading?: string; definition: string }[] };
type Risks = {
  risks: { id: string; title: string; probability: string; impact: string; mitigation: string; owner?: string; status: string }[];
};
type Estimate = {
  currency: string;
  unit_price: number;
  items: { phase: string; task: string; person_months: number }[];
  notes?: string[];
};
type Api = { spec: { info?: { title?: string; version?: string }; paths: Record<string, Record<string, { summary?: string }>> } };

const LEVEL_COLOR: Record<string, string> = { 高: "red", 中: "yellow", 低: "gray" };
const METHOD_COLOR: Record<string, string> = { GET: "brand", POST: "teal", PUT: "orange", PATCH: "orange", DELETE: "red" };

// right: 右寄せにする列（数値）の見出し
function DataTable({
  head,
  right = [],
  children,
  minWidth = 600,
}: {
  head: string[];
  right?: string[];
  children: React.ReactNode;
  minWidth?: number;
}) {
  return (
    <Table.ScrollContainer minWidth={minWidth} type="native" className="ks-table-frame">
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>{head.map((h) => <Table.Th key={h} ta={right.includes(h) ? "right" : undefined} style={{ whiteSpace: "nowrap" }}>{h}</Table.Th>)}</Table.Tr>
        </Table.Thead>
        {children}
      </Table>
    </Table.ScrollContainer>
  );
}

export function GlossaryView({ data }: { data: Glossary }) {
  const terms = [...data.terms].sort((a, b) => (a.reading ?? a.term).localeCompare(b.reading ?? b.term, "ja"));
  return (
    <DataTable head={["用語", "読み", "定義"]}>
      <Table.Tbody>
        {terms.map((t) => (
          <Table.Tr key={t.term}>
            <Table.Td fw={700}>{t.term}</Table.Td>
            <Table.Td c="dimmed">{t.reading}</Table.Td>
            <Table.Td>{t.definition}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </DataTable>
  );
}

export function RisksView({ data }: { data: Risks }) {
  const level = (v: string) => <Badge color={LEVEL_COLOR[v] ?? "gray"} variant="light">{v}</Badge>;
  return (
    <DataTable head={["ID", "リスク", "発生確率", "影響度", "対策", "担当", "状態"]} minWidth={900}>
      <Table.Tbody>
        {data.risks.map((r) => (
          <Table.Tr key={r.id} opacity={r.status === "closed" ? 0.5 : 1}>
            <Table.Td style={{ whiteSpace: "nowrap" }}>{r.id}</Table.Td>
            <Table.Td>{r.title}</Table.Td>
            <Table.Td>{level(r.probability)}</Table.Td>
            <Table.Td>{level(r.impact)}</Table.Td>
            <Table.Td>{r.mitigation}</Table.Td>
            <Table.Td style={{ whiteSpace: "nowrap" }}>{r.owner}</Table.Td>
            <Table.Td>
              <Badge color={r.status === "open" ? "blue" : "gray"} variant="outline">{r.status}</Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </DataTable>
  );
}

export function estimateTotal(data: Estimate) {
  const months = data.items.reduce((sum, i) => sum + i.person_months, 0);
  return { months, amount: Math.round(months * data.unit_price) };
}

export function EstimateView({ data }: { data: Estimate }) {
  const fmt = new Intl.NumberFormat("ja-JP", { style: "currency", currency: data.currency });
  const total = estimateTotal(data);
  return (
    <>
      <Text mb="sm">人月単価：{fmt.format(data.unit_price)}</Text>
      <DataTable head={["フェーズ", "作業", "人月", "金額"]} right={["人月", "金額"]}>
        <Table.Tbody>
          {data.items.map((i) => (
            <Table.Tr key={i.phase + i.task}>
              <Table.Td>{i.phase}</Table.Td>
              <Table.Td>{i.task}</Table.Td>
              <Table.Td ta="right">{i.person_months}</Table.Td>
              <Table.Td ta="right">{fmt.format(Math.round(i.person_months * data.unit_price))}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr>
            <Table.Th colSpan={2}>合計</Table.Th>
            <Table.Th ta="right">{total.months}</Table.Th>
            <Table.Th ta="right">{fmt.format(total.amount)}</Table.Th>
          </Table.Tr>
        </Table.Tfoot>
      </DataTable>
      {data.notes && (
        <List mt="md" size="sm">
          {data.notes.map((n) => <List.Item key={n}>{n}</List.Item>)}
        </List>
      )}
    </>
  );
}

export function ApiView({ data }: { data: Api }) {
  const rows = Object.entries(data.spec.paths).flatMap(([path, ops]) =>
    Object.entries(ops).map(([method, op]) => ({ path, method: method.toUpperCase(), summary: op.summary ?? "" })),
  );
  return (
    <>
      {data.spec.info && <Text mb="sm">{data.spec.info.title} v{data.spec.info.version}</Text>}
      <DataTable head={["メソッド", "パス", "概要"]}>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.method + r.path}>
              <Table.Td><Badge color={METHOD_COLOR[r.method] ?? "gray"}>{r.method}</Badge></Table.Td>
              <Table.Td><Code>{r.path}</Code></Table.Td>
              <Table.Td>{r.summary}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </DataTable>
    </>
  );
}
