import { Badge, Code, List, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { estimateTotals, normalizeEstimate, taxLabel } from "../lib/estimate";
import { usePrint } from "../lib/print";

type Glossary = { terms: { term: string; reading?: string; definition: string }[] };
type Risks = {
  risks: { id: string; title: string; probability: string; impact: string; mitigation: string; owner?: string; status: string }[];
};
type Api = { spec: { info?: { title?: string; version?: string }; paths: Record<string, Record<string, { summary?: string }>> } };

const LEVEL_COLOR: Record<string, string> = { 高: "red", 中: "yellow", 低: "gray" };
// PDF は白黒で刷られても読めるよう、色ではなく記号と文字で示す
const LEVEL_MARK: Record<string, string> = { 高: "●", 中: "◐", 低: "○" };
const STATUS_LABEL: Record<string, string> = { open: "対応中", closed: "完了" };
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
  const print = usePrint();
  const level = (v: string) =>
    print ? `${LEVEL_MARK[v] ?? ""} ${v}` : <Badge color={LEVEL_COLOR[v] ?? "gray"} variant="light">{v}</Badge>;
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
            <Table.Td style={{ whiteSpace: "nowrap" }}>
              {print ? (STATUS_LABEL[r.status] ?? r.status) : <Badge color={r.status === "open" ? "blue" : "gray"} variant="outline">{r.status}</Badge>}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </DataTable>
  );
}

const longDate = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function Total({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Paper p="lg" radius="md" className="ks-estimate-total">
      <Text size="sm" c="dimmed" fw={500}>{label}</Text>
      <Text fz={28} fw={700} lh={1.3} className="ks-stat-value">{value}</Text>
      <Text size="xs" c="dimmed" mt={4}>{sub}</Text>
    </Paper>
  );
}

function Conditions({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Text size="sm" fw={700}>{label}</Text>
      <List size="sm" mt={4}>
        {items.map((n) => <List.Item key={n}>{n}</List.Item>)}
      </List>
    </div>
  );
}

export function EstimateView({ data }: { data: Record<string, unknown> }) {
  const e = normalizeEstimate(data);
  const fmt = new Intl.NumberFormat("ja-JP", { style: "currency", currency: e.currency });
  const total = estimateTotals(e);
  const tax = taxLabel(e);
  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, xs: e.monthly ? 2 : 1 }} spacing="md">
        <Total
          label="初期費用"
          value={fmt.format(total.initial)}
          sub={`${tax}・${total.months} 人月（人月単価 ${fmt.format(e.initial.unit_price)}）`}
        />
        {total.monthly != null && <Total label="月額費用" value={`${fmt.format(total.monthly)} / 月`} sub={`${tax}・本番公開後の継続利用料`} />}
      </SimpleGrid>

      <section>
        <Title order={3} mb="sm">初期費用</Title>
        <DataTable head={["フェーズ", "作業", "人月", "金額"]} right={["人月", "金額"]}>
          <Table.Tbody>
            {e.initial.items.map((i) => (
              <Table.Tr key={i.phase + i.task}>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{i.phase}</Table.Td>
                <Table.Td>{i.task}</Table.Td>
                <Table.Td ta="right">{i.person_months}</Table.Td>
                <Table.Td ta="right">{fmt.format(Math.round(i.person_months * e.initial.unit_price))}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Th colSpan={2}>初期費用 合計（{tax}）</Table.Th>
              <Table.Th ta="right">{total.months}</Table.Th>
              <Table.Th ta="right">{fmt.format(total.initial)}</Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </DataTable>
      </section>

      {e.monthly && (
        <section>
          <Title order={3} mb="sm">月額費用</Title>
          <DataTable head={["サービス", "含まれるもの", "月額"]} right={["月額"]}>
            <Table.Tbody>
              {e.monthly.items.map((i) => (
                <Table.Tr key={i.name}>
                  <Table.Td fw={500} style={{ whiteSpace: "nowrap" }}>{i.name}</Table.Td>
                  <Table.Td>
                    {i.includes?.length ? (
                      <List size="sm">{i.includes.map((n) => <List.Item key={n}>{n}</List.Item>)}</List>
                    ) : null}
                    {i.limits && <Text size="xs" c="dimmed" mt={4}>※ {i.limits}</Text>}
                  </Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>{fmt.format(i.amount)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={2}>月額費用 合計（{tax}）</Table.Th>
                <Table.Th ta="right" style={{ whiteSpace: "nowrap" }}>{fmt.format(total.monthly!)}</Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </DataTable>
        </section>
      )}

      <section>
        <Title order={3} mb="sm">前提条件</Title>
        <Stack gap="md">
          <Conditions
            label="金額について"
            items={[
              `金額はすべて${tax}です`,
              ...(e.valid_until ? [`本見積もりの有効期限は${longDate.format(new Date(e.valid_until))}です`] : []),
            ]}
          />
          <Conditions label="お見積もりに含まれない費用" items={e.excludes} />
          <Conditions label="お取引条件" items={e.terms} />
          <Conditions label="その他" items={e.notes} />
        </Stack>
      </section>
    </Stack>
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
