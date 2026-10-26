// ```usecase ブロック（YAML）をユースケース図として描画する。
// ページ遷移図（画面のタイルを矢印で結ぶ）やER図（表を線で結ぶ）と見分けやすいよう、線を使わずに組む:
// 区画（現地・事務所など）の面の中に、アクターごとの段を作り、左端にアクターの色を持つカードを格子に並べる。
// 条件付きの操作は点線のカード、区画の間の受け渡し（同期など）は区画をまたぐ帯で描く
import { Code, Text } from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconServer2,
  IconUser,
} from "@tabler/icons-react";
import { useContext, useMemo } from "react";
import { Link } from "react-router-dom";
import { parseYaml } from "../lib/docs";
import { usePrint } from "../lib/print";
import { ScreenLinksContext } from "../lib/screenLinks";
import { buildUsecase, listOf, type Device, type UsecaseCase, type UsecaseRow, type UsecaseSpec } from "../lib/usecase";
import { ICON_STROKE } from "./icons";

const filled = (color: string) => `var(--mantine-color-${color}-filled)`;

const DEVICE_MARK: Record<Device, { icon: typeof IconUser; label: string }> = {
  desktop: { icon: IconDeviceDesktop, label: "パソコン" },
  tablet: { icon: IconDeviceTablet, label: "タブレット" },
  mobile: { icon: IconDeviceMobile, label: "スマートフォン" },
};

// 画面の ID。画面仕様にその画面があればリンクにする
function ScreenChip({ id }: { id: string }) {
  const links = useContext(ScreenLinksContext);
  const print = usePrint();
  const href = !print && links.mocks.has(id) ? links.href?.(id) : undefined;
  return href ? (
    <Link to={href} className="uc-screen" title={`${id} の画面仕様を開く`}>{id}</Link>
  ) : (
    <span className="uc-screen">{id}</span>
  );
}

function CaseCard({ c }: { c: UsecaseCase }) {
  const later = c.phase === "later";
  const screens = listOf(c.screen);
  return (
    <div
      className="uc-card"
      data-condition={c.condition ? "" : undefined}
      data-later={later || undefined}
      style={{ "--uc-color": filled(c.color) } as React.CSSProperties}
    >
      <span className="uc-card-head">
        <span className="uc-card-id">{c.id}</span>
        {later && <span className="uc-later">本番以降</span>}
        {screens.map((s) => <ScreenChip key={s} id={s} />)}
      </span>
      <span className="uc-card-name">{c.name}</span>
      {c.condition && <span className="uc-card-sub">{c.condition}</span>}
      {c.note && <span className="uc-card-sub">{c.note}</span>}
      {c.includes.length > 0 && <span className="uc-card-sub">{c.includes.join("・")} を含む</span>}
      {c.extends.length > 0 && <span className="uc-card-sub">{c.extends.join("・")} を条件付きで拡張</span>}
      {c.others.length > 0 && <span className="uc-card-sub">{c.others.join("・")}も使う</span>}
    </div>
  );
}

function Row({ row }: { row: UsecaseRow }) {
  const a = row.actor;
  const Icon = a?.kind === "system" ? IconServer2 : IconUser;
  return (
    <div className="uc-row">
      <div className="uc-actor">
        {a && (
          <>
            <span className="uc-avatar" data-kind={a.kind ?? "person"} style={{ color: filled(a.color) }}>
              <Icon size={26} stroke={ICON_STROKE} />
            </span>
            <span className="uc-actor-name">{a.name}</span>
            {listOf(a.device).length > 0 && (
              <span className="uc-devices">
                {listOf(a.device).map((d) => {
                  const m = DEVICE_MARK[d];
                  if (!m) return null;
                  return (
                    <span key={d} title={m.label}>
                      <m.icon size={14} stroke={ICON_STROKE} />
                      {m.label}
                    </span>
                  );
                })}
              </span>
            )}
            {a.note && <span className="uc-actor-note">{a.note}</span>}
          </>
        )}
      </div>
      <div className="uc-row-body">
        {a?.inheritsName && (
          <Text size="sm" c="dimmed" className="uc-inherits">
            <IconCheck size={14} stroke={ICON_STROKE} />
            {a.inheritsName}の全操作に加えて
          </Text>
        )}
        <div className="uc-cards">
          {row.cases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UsecaseDiagram({ source }: { source: string }) {
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<UsecaseSpec>(source);
      if (!Array.isArray(spec?.actors) || !Array.isArray(spec?.cases)) throw new Error("actors と cases を書いてください");
      return { view: buildUsecase(spec) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  if ("error" in parsed) return <Code block c="red">ユースケース図を読めません: {parsed.error}</Code>;
  const { zones, hasCondition, hasLater } = parsed.view;
  const hasFlow = zones.some((z) => z.flowAfter);

  return (
    <figure className="uc">
      {zones.map((z) => (
        <div key={z.id || z.name}>
          <section className="uc-zone">
            <header className="uc-zone-head">
              <span className="uc-zone-tag" style={{ background: filled(z.color) }}>{z.name}</span>
              {z.note && <span className="uc-zone-note">{z.note}</span>}
            </header>
            {z.rows.map((r, i) => (
              <Row key={r.actor?.id ?? `none-${i}`} row={r} />
            ))}
          </section>
          {z.flowAfter && (
            <div className="uc-flow">
              {z.flowAfter.up ? <IconArrowUp size={18} stroke={ICON_STROKE} /> : <IconArrowDown size={18} stroke={ICON_STROKE} />}
              <b>{z.flowAfter.label}</b>
              {z.flowAfter.note && <span>{z.flowAfter.note}</span>}
            </div>
          )}
        </div>
      ))}
      {(hasCondition || hasFlow || hasLater) && (
        <figcaption className="uc-legend">
          <span><i className="uc-legend-card" />常に行う操作</span>
          {hasCondition && <span><i className="uc-legend-card" data-condition="" />条件付きの操作（条件はカード内に記載）</span>}
          {hasLater && <span><i className="uc-legend-card" data-later="" />本番公開より後に作る機能</span>}
          {hasFlow && <span><i className="uc-legend-flow" />データの受け渡し</span>}
        </figcaption>
      )}
    </figure>
  );
}
