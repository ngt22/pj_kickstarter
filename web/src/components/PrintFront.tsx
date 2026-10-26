// PDF の表紙・目次と、提案概要・文書情報のページ。画面の表紙（ProjectCover）とは別に、紙の提案書の体裁で組む
import { useMemo } from "react";
import type { DocRecord, ProjectRecord } from "../lib/docs";
import { fromDay } from "../lib/gantt";
import { buildOverview } from "../lib/overview";
import type { SiteSettings } from "../lib/settings";

const longDate = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

type Props = { project: ProjectRecord; docs: DocRecord[]; site: SiteSettings };

export function PrintCover({ project, site }: Omit<Props, "docs">) {
  const rows = [
    ["提出日", project.proposed_at && longDate.format(new Date(project.proposed_at))],
    ["版", project.version && `第 ${project.version} 版`],
    ["提案者", site.vendor_name],
    ["担当", site.contact],
  ].filter((r): r is [string, string] => !!r[1]);
  return (
    <div className="pc">
      {project.client && <p className="pc-to">{project.client}</p>}
      <div className="pc-main">
        <p className="pc-kicker">ご提案書</p>
        <h1 className="pc-title">{project.name}</h1>
        {project.summary && <p className="pc-summary">{project.summary}</p>}
      </div>
      <dl className="pc-meta">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="pc-note">
        Confidential　本資料は{project.client ? `${project.client}へのご提案` : "ご提案"}のために作成したものです。第三者への開示・複製はご遠慮ください。
      </p>
    </div>
  );
}

export function PrintToc({ docs }: Pick<Props, "docs">) {
  return (
    <div className="pf">
      <h2 className="pf-h">目次</h2>
      <ol className="pf-toc">
        {docs.map((d, i) => (
          <li key={d.type}>
            <a href={`#doc-${d.type}`}>
              <span className="pf-toc-num">{i + 1}</span>
              {d.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PrintOverview({ project, docs, site }: Props) {
  const ov = useMemo(() => buildOverview(docs), [docs]);
  const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: ov.estimate?.currency ?? "JPY" });
  const summary = [
    ov.period && ["開発期間", `約 ${ov.period.weeks} 週間（${longDate.format(fromDay(ov.period.start))} 〜 ${longDate.format(fromDay(ov.period.end - 1))}）`],
    ov.estimate && ["初期費用", `${yen.format(ov.estimate.initial)}（${ov.estimate.tax}）`],
    ov.estimate?.monthly != null && ["月額費用", `${yen.format(ov.estimate.monthly)}（${ov.estimate.tax}）`],
    ov.milestones.length > 0 && ["主なマイルストーン", ov.milestones.map((m) => `${longDate.format(fromDay(m.day))}　${m.name}`)],
  ].filter((r): r is [string, string | string[]] => !!r);
  const info = [
    ["文書名", `${project.name}　ご提案書`],
    ["宛先", project.client],
    ["提案者", [site.vendor_name, site.contact && `担当 ${site.contact}`].filter(Boolean).join("　")],
    ["版・提出日", [project.version && `第 ${project.version} 版`, project.proposed_at && longDate.format(new Date(project.proposed_at))].filter(Boolean).join("　")],
    ["取扱い", "社外秘（Confidential）"],
  ].filter((r): r is [string, string] => !!r[1]);

  return (
    <div className="pf">
      {summary.length > 0 && (
        <>
          <h2 className="pf-h">提案概要</h2>
          <table className="pf-kv">
            <tbody>
              {summary.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{Array.isArray(v) ? v.map((x) => <div key={x}>{x}</div>) : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="pf-h">文書情報</h2>
      <table className="pf-kv">
        <tbody>
          {info.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
