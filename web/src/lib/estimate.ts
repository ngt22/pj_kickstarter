// 見積もり（estimate.yaml）を初期費用と月額費用に正規化して集計する。
// 旧形式（トップレベルの unit_price と items）は初期費用として読む（ingest の EstimateDoc と同じ扱い）

export type InitialItem = { phase: string; task: string; person_months: number };
export type MonthlyItem = { name: string; amount: number; includes?: string[]; limits?: string };

export type Estimate = {
  currency: string;
  tax: "excluded" | "included";
  valid_until?: string;
  initial: { unit_price: number; items: InitialItem[] };
  monthly?: { items: MonthlyItem[] };
  excludes: string[];
  terms: string[];
  notes: string[];
};

type Raw = Partial<Omit<Estimate, "valid_until">> & { valid_until?: string | Date; unit_price?: number; items?: InitialItem[] };

export function normalizeEstimate(raw: Raw): Estimate {
  const initial = raw.initial ?? { unit_price: raw.unit_price ?? 0, items: raw.items ?? [] };
  return {
    currency: raw.currency ?? "JPY",
    tax: raw.tax === "included" ? "included" : "excluded",
    // YAML の日付は Date として読まれることがある
    valid_until: raw.valid_until instanceof Date ? raw.valid_until.toISOString().slice(0, 10) : raw.valid_until || undefined,
    initial,
    monthly: raw.monthly?.items?.length ? raw.monthly : undefined,
    excludes: raw.excludes ?? [],
    terms: raw.terms ?? [],
    notes: raw.notes ?? [],
  };
}

export function estimateTotals(e: Estimate) {
  // 小数の人月を足すと 0.1 + 0.2 のような誤差が出るので、表示用に丸める
  const months = Math.round(e.initial.items.reduce((sum, i) => sum + i.person_months, 0) * 100) / 100;
  return {
    months,
    initial: Math.round(e.initial.items.reduce((sum, i) => sum + i.person_months * e.initial.unit_price, 0)),
    monthly: e.monthly ? e.monthly.items.reduce((sum, i) => sum + i.amount, 0) : undefined,
  };
}

export const taxLabel = (e: Pick<Estimate, "tax">) => (e.tax === "included" ? "税込" : "税抜");
