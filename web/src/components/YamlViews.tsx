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

export function GlossaryView({ data }: { data: Glossary }) {
  const terms = [...data.terms].sort((a, b) => (a.reading ?? a.term).localeCompare(b.reading ?? b.term, "ja"));
  return (
    <table>
      <thead><tr><th>用語</th><th>読み</th><th>定義</th></tr></thead>
      <tbody>
        {terms.map((t) => (
          <tr key={t.term}><td>{t.term}</td><td>{t.reading}</td><td>{t.definition}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function RisksView({ data }: { data: Risks }) {
  return (
    <table>
      <thead>
        <tr><th>ID</th><th>リスク</th><th>発生確率</th><th>影響度</th><th>対策</th><th>担当</th><th>状態</th></tr>
      </thead>
      <tbody>
        {data.risks.map((r) => (
          <tr key={r.id} className={r.status === "closed" ? "muted" : ""}>
            <td>{r.id}</td><td>{r.title}</td><td className={`level ${r.probability}`}>{r.probability}</td>
            <td className={`level ${r.impact}`}>{r.impact}</td><td>{r.mitigation}</td><td>{r.owner}</td><td>{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
      <p>人月単価：{fmt.format(data.unit_price)}</p>
      <table>
        <thead><tr><th>フェーズ</th><th>作業</th><th className="num">人月</th><th className="num">金額</th></tr></thead>
        <tbody>
          {data.items.map((i) => (
            <tr key={i.phase + i.task}>
              <td>{i.phase}</td><td>{i.task}</td><td className="num">{i.person_months}</td>
              <td className="num">{fmt.format(Math.round(i.person_months * data.unit_price))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th colSpan={2}>合計</th><th className="num">{total.months}</th><th className="num">{fmt.format(total.amount)}</th></tr>
        </tfoot>
      </table>
      {data.notes && <ul>{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </>
  );
}

export function ApiView({ data }: { data: Api }) {
  const rows = Object.entries(data.spec.paths).flatMap(([path, ops]) =>
    Object.entries(ops).map(([method, op]) => ({ path, method: method.toUpperCase(), summary: op.summary ?? "" })),
  );
  return (
    <>
      {data.spec.info && <p>{data.spec.info.title} v{data.spec.info.version}</p>}
      <table>
        <thead><tr><th>メソッド</th><th>パス</th><th>概要</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.method + r.path}><td><code>{r.method}</code></td><td><code>{r.path}</code></td><td>{r.summary}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
