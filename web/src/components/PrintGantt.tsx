// PDF 用の工程表。画面のガント（スクロール・今日の線・依存の矢印）は使わず、
// 「工程・担当・期間」の表の右に、週の目盛りと棒を並べる。幅は % で決めるので、紙の幅を測らずに組める
import { fromDay, type GanttSpec, type GanttTask } from "../lib/gantt";

const md = (day: number) => {
  const d = fromDay(day);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const period = (s: number, e: number, milestone?: boolean) => (milestone ? md(s) : `${md(s)}〜${md(e - 1)}`);

export default function PrintGantt({ spec, tasks }: { spec: GanttSpec; tasks: GanttTask[] }) {
  const first = Math.min(...tasks.map((t) => t.start));
  const last = Math.max(...tasks.map((t) => t.end));
  // 前後を週の頭（月曜）にそろえる
  const from = first - ((fromDay(first).getUTCDay() + 6) % 7);
  const to = last + ((7 - ((fromDay(last).getUTCDay() + 6) % 7)) % 7);
  const pct = (day: number) => `${((day - from) / (to - from)) * 100}%`;
  const weeks = Array.from({ length: Math.ceil((to - from) / 7) }, (_, i) => from + i * 7);
  // 週が多いときは目盛りの文字を間引く（線は全部引く）
  const every = Math.ceil(weeks.length / 16);
  const months: { day: number; label: string }[] = [];
  for (let d = from; d < to; d++) {
    const date = fromDay(d);
    if (d === from || date.getUTCDate() === 1)
      months.push({ day: d, label: d === from || date.getUTCMonth() === 0 ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月` : `${date.getUTCMonth() + 1}月` });
  }
  const grid = (
    <>
      {weeks.map((w) => (
        <i key={w} className="pg-line" style={{ left: pct(w) }} />
      ))}
      {months.slice(1).map((m) => (
        <i key={`m${m.day}`} className="pg-line pg-month-line" style={{ left: pct(m.day) }} />
      ))}
    </>
  );

  return (
    <figure className="pg">
      {spec.title && <figcaption className="ks-print-caption">{spec.title}</figcaption>}
      <table>
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "17%" }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>工程</th>
            <th rowSpan={2}>担当</th>
            <th rowSpan={2}>期間</th>
            <th className="pg-time pg-months">
              {months.map((m) => (
                <span key={m.day} style={{ left: pct(m.day) }}>{m.label}</span>
              ))}
            </th>
          </tr>
          <tr>
            <th className="pg-time pg-weeks">
              {weeks.map((w, i) => (i % every === 0 ? <span key={w} style={{ left: pct(w) }}>{md(w)}</span> : null))}
            </th>
          </tr>
        </thead>
        {spec.sections.map((sec, si) => {
          const ts = tasks.filter((t) => t.section === si);
          if (!ts.length) return null;
          const s = Math.min(...ts.map((t) => t.start));
          const e = Math.max(...ts.map((t) => t.end));
          return (
            <tbody key={si}>
              <tr className="pg-section">
                <td colSpan={2}>{sec.name}</td>
                <td>{period(s, e)}</td>
                <td className="pg-time">
                  {grid}
                  <i className="pg-summary" style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }} />
                </td>
              </tr>
              {ts.map((t) => (
                <tr key={t.key}>
                  <td className="pg-name">{t.name}</td>
                  <td>{t.owner}</td>
                  <td>{period(t.start, t.end, t.milestone)}</td>
                  <td className="pg-time">
                    {grid}
                    {t.milestone ? (
                      <i className="pg-milestone" style={{ left: pct(t.start) }}>◆</i>
                    ) : (
                      <i className="pg-bar" style={{ left: pct(t.start), width: `calc(${pct(t.end)} - ${pct(t.start)})` }} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </figure>
  );
}
