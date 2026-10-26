// ```flow ブロック（YAML）をページ遷移図として描画する。
// ユースケース図（線のないカードの格子）やER図（表を線で結ぶ）と見分けやすいよう、
// 区画の色の面に、アイコンのタイルを持つ画面のカードを置き、細い曲線と丸いラベルで結ぶ。開始・終了は丸で描く
import { Button, Code, Group, Loader, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsMaximize,
  IconCalendar,
  IconChecks,
  IconCircleCheck,
  IconDeviceDesktop,
  IconDownload,
  IconEye,
  IconHistory,
  IconHome,
  IconList,
  IconLogin,
  IconMap,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShoppingCart,
  IconUser,
  type Icon,
} from "@tabler/icons-react";
import { useEffect, useId, useMemo, useState } from "react";
import { parseYaml } from "../lib/docs";
import { layoutFlow, PRINT_DIMS, SCREEN_DIMS, type FlowLane, type FlowLayout, type FlowNode, type FlowSpec } from "../lib/flow";
import { ICON_STROKE } from "./icons";
import Scaled from "./Scaled";
import { usePrint } from "../lib/print";

// 区画の左右の余白（styles.css・print.css の .fl-zone と合わせる）
const PAD_X = 28;
const PRINT_PAD_X = 16;

// 画面名から、それらしいアイコンを選ぶ（先に書いたものが優先）
const SCREEN_ICONS: [RegExp, Icon][] = [
  [/前回|履歴/, IconHistory],
  [/ログイン|サインイン/, IconLogin],
  [/一括/, IconChecks],
  [/完了|サンクス/, IconCircleCheck],
  [/一覧|リスト/, IconList],
  [/図面|地図|マップ/, IconMap],
  [/検索|探す/, IconSearch],
  [/確認|プレビュー|詳細/, IconEye],
  [/入力|編集|修正|記録/, IconPencil],
  [/登録|新規|追加|作成/, IconPlus],
  [/出力|ダウンロード|印刷|帳票/, IconDownload],
  [/設定|マスタ|管理/, IconSettings],
  [/予約|カレンダー|日程/, IconCalendar],
  [/カート|購入|注文/, IconShoppingCart],
  [/マイページ|アカウント|プロフィール/, IconUser],
  [/トップ|ホーム/, IconHome],
];

function iconFor(name: string): Icon {
  return SCREEN_ICONS.find(([re]) => re.test(name))?.[1] ?? IconDeviceDesktop;
}

function Node({ n, color, print }: { n: FlowNode; color: string; print: boolean }) {
  const style = { left: n.x, top: n.y, width: n.w, height: n.h };
  if (n.kind === "terminal")
    return (
      <div className="fl-terminal" data-role={n.role} style={style}>
        {n.label}
      </div>
    );
  const I = iconFor(n.label);
  return (
    <div className="fl-card" style={style}>
      {!print && <span className="fl-icon" style={{ color: `var(--mantine-color-${color}-filled)`, background: `var(--mantine-color-${color}-light)` }}>
        <I size={20} stroke={ICON_STROKE} />
      </span>}
      <span className="fl-text">
        <span className="fl-id">{n.id}</span>
        <span className="fl-name">{n.label}</span>
      </span>
    </div>
  );
}

function Lane({ lane, color, width, marker, print }: { lane: FlowLane; color: string; width: number; marker: string; print: boolean }) {
  return (
    <div className="fl-lane">
      {lane.name && <div className="fl-lane-name">{lane.name}</div>}
      <div className="fl-canvas" style={{ width, height: lane.height }}>
        <svg className="fl-edges" width={width} height={lane.height} aria-hidden>
          {lane.edges.map((e) => (
            <path key={e.id} d={e.path} className="fl-edge" data-back={e.back || undefined} markerEnd={`url(#${marker})`} />
          ))}
        </svg>
        {lane.edges.map((e) =>
          e.label ? (
            <span
              key={e.id}
              className="fl-edge-label"
              data-back={e.back || undefined}
              data-side={e.side}
              data-align={e.align}
              style={{ left: e.lx, top: e.ly }}
            >
              {e.label}
            </span>
          ) : null,
        )}
        {lane.nodes.map((n) => (
          <Node key={n.id} n={n} color={color} print={print} />
        ))}
        {lane.note && (
          <p className="fl-lane-note" style={{ left: lane.noteX, width: lane.noteW }}>
            {lane.note}
          </p>
        )}
      </div>
    </div>
  );
}

// PDF では図の下に遷移の一覧を表で載せる（図の線とラベルを、文字で確かめられるように）
function TransitionTable({ spec }: { spec: FlowSpec }) {
  const name = new Map<string, string>([
    ...spec.screens.map((s) => [s.id, `${s.id}　${s.name}`] as [string, string]),
    ...(spec.terminals ?? []).map((t) => [t.id, `（${t.label}）`] as [string, string]),
    ...spec.zones.map((z) => [z.id, `［${z.name}］`] as [string, string]),
  ]);
  const rows = [
    ...(spec.edges ?? []).map((e) => ({ from: e.from, to: e.to, label: e.label, note: e.type === "back" ? "戻る" : undefined })),
    ...(spec.flows ?? []).map((f) => ({ from: f.from, to: f.to, label: f.label, note: f.note ?? "区画の間の受け渡し" })),
  ];
  if (!rows.length) return null;
  return (
    <div className="fl-table ks-table-frame">
      <p className="ks-print-caption">画面遷移の一覧</p>
      <table>
        <thead>
          <tr>
            <th>遷移元</th>
            <th>操作・きっかけ</th>
            <th>遷移先</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{name.get(r.from) ?? r.from}</td>
              <td>{r.label ?? "—"}</td>
              <td>{name.get(r.to) ?? r.to}</td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FlowDiagram({ source }: { source: string }) {
  const marker = `fl-arrow-${useId().replace(/:/g, "")}`;
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<FlowSpec>(source);
      if (!Array.isArray(spec?.zones) || !Array.isArray(spec?.screens)) throw new Error("zones と screens を書いてください");
      return { spec, error: undefined };
    } catch (e) {
      return { spec: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);
  const [layout, setLayout] = useState<FlowLayout | string>();
  const [opened, { open, close }] = useDisclosure(false);
  const print = usePrint();

  useEffect(() => {
    if (!parsed.spec) return;
    let alive = true;
    layoutFlow(parsed.spec, print ? PRINT_DIMS : SCREEN_DIMS)
      .then((l) => alive && setLayout(l))
      .catch((e) => alive && setLayout(String(e)));
    return () => {
      alive = false;
    };
  }, [parsed, print]);

  if (parsed.error) return <Code block c="red">ページ遷移図を読めません: {parsed.error}</Code>;
  if (typeof layout === "string") return <Code block c="red">ページ遷移図を配置できません: {layout}</Code>;
  if (!layout) return <Loader size="sm" />;

  const width = layout.width + (print ? PRINT_PAD_X : PAD_X) * 2;
  const content = (
    <>
      <svg width={0} height={0} className="fl-defs" aria-hidden>
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M1,1 L9,5 L1,9" className="fl-arrow" />
          </marker>
        </defs>
      </svg>
      {layout.zones.map((z) => (
        <div key={z.id}>
          <section className="fl-zone" style={{ "--fl-zone": `var(--mantine-color-${z.color}-filled)` } as React.CSSProperties}>
            <header className="fl-zone-head">
              <span className="fl-zone-tag">{z.name}</span>
              {z.note && <span className="fl-zone-note">{z.note}</span>}
            </header>
            {z.lanes.map((l, i) => (
              <Lane key={l.id || i} lane={l} color={z.color} width={layout.width} marker={marker} print={print} />
            ))}
            {z.footnote && <p className="fl-footnote">{z.footnote}</p>}
          </section>
          {z.flowAfter && (
            <div className="fl-flow">
              <span className="fl-flow-line" />
              <span className="fl-flow-card">
                {z.flowAfter.up ? <IconArrowUp size={16} stroke={ICON_STROKE} /> : <IconArrowDown size={16} stroke={ICON_STROKE} />}
                <span>
                  <b>{z.flowAfter.label}</b>
                  {z.flowAfter.note && <small>{z.flowAfter.note}</small>}
                </span>
              </span>
            </div>
          )}
        </div>
      ))}
      <figcaption className="fl-legend">
        <span><i className="fl-legend-line" />画面遷移</span>
        {layout.hasBack && <span><i className="fl-legend-line" data-back="" />戻る（確定・キャンセルなど）</span>}
        {layout.hasFlow && <span><i className="fl-legend-line" data-flow="" />区画の間のデータの受け渡し</span>}
        {layout.notes.map((n) => (
          <span key={n} className="fl-legend-note">{n}</span>
        ))}
      </figcaption>
    </>
  );
  return (
    <figure className="fl">
      {!print && (
      <Group justify="flex-end" mb={4}>
        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconArrowsMaximize size={14} stroke={ICON_STROKE} />} onClick={open}>
          拡大して見る
        </Button>
      </Group>
      )}
      <Scaled width={width}>{content}</Scaled>
      {print && parsed.spec && <TransitionTable spec={parsed.spec} />}
      <Modal opened={opened} onClose={close} fullScreen title="ページ遷移図">
        <div className="fl-full" style={{ width }}>{content}</div>
      </Modal>
    </figure>
  );
}
