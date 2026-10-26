// 見積もり（estimate.yaml）を初期費用と月額費用に正規化して集計する。
// 旧形式（トップレベルの unit_price と items）は初期費用として読む（ingest の EstimateDoc と同じ扱い）

// 金額は amount で直接書くか、person_months × 単価で計算する
export type InitialItem = { phase: string; task: string; person_months?: number; amount?: number };
export type MonthlyItem = { name: string; amount: number; includes?: string[]; limits?: string; note?: string };
// 合計に含めない任意の追加（per: once は一括、monthly は月額）
export type OptionItem = { name: string; amount: number; per?: "once" | "monthly"; note?: string };

export type Estimate = {
  currency: string;
  tax: "excluded" | "included";
  valid_until?: string;
  initial: { unit_price: number; items: InitialItem[] };
  monthly?: { items: MonthlyItem[] };
  options: OptionItem[];
  // false で人月・単価を見せず、フェーズ・作業・金額だけにする
  show_breakdown: boolean;
  excludes: string[];
  terms: string[];
  notes: string[];
};

type Raw = Partial<Omit<Estimate, "valid_until" | "initial" | "monthly">> & {
  valid_until?: string | Date;
  unit_price?: number;
  items?: InitialItem[];
  initial?: { unit_price?: number; items: InitialItem[] };
  monthly?: { items: MonthlyItem[] } | MonthlyItem[];
};

export function normalizeEstimate(raw: Raw): Estimate {
  const initial = { unit_price: raw.initial?.unit_price ?? raw.unit_price ?? 0, items: raw.initial?.items ?? raw.items ?? [] };
  // monthly は「- name: …」のリストだけでも書ける
  const monthly = Array.isArray(raw.monthly) ? { items: raw.monthly } : raw.monthly;
  return {
    currency: raw.currency ?? "JPY",
    tax: raw.tax === "included" ? "included" : "excluded",
    // YAML の日付は Date として読まれることがある
    valid_until: raw.valid_until instanceof Date ? raw.valid_until.toISOString().slice(0, 10) : raw.valid_until || undefined,
    initial,
    monthly: monthly?.items?.length ? monthly : undefined,
    options: raw.options ?? [],
    show_breakdown: raw.show_breakdown !== false,
    excludes: raw.excludes ?? [],
    terms: raw.terms ?? [],
    notes: raw.notes ?? [],
  };
}

export const itemAmount = (e: Estimate, i: InitialItem) => i.amount ?? Math.round((i.person_months ?? 0) * e.initial.unit_price);

export function estimateTotals(e: Estimate) {
  // 小数の人月を足すと 0.1 + 0.2 のような誤差が出るので、表示用に丸める
  const months = Math.round(e.initial.items.reduce((sum, i) => sum + (i.person_months ?? 0), 0) * 100) / 100;
  return {
    months,
    initial: e.initial.items.reduce((sum, i) => sum + itemAmount(e, i), 0),
    monthly: e.monthly ? e.monthly.items.reduce((sum, i) => sum + i.amount, 0) : undefined,
  };
}

export const taxLabel = (e: Pick<Estimate, "tax">) => (e.tax === "included" ? "税込" : "税抜");
