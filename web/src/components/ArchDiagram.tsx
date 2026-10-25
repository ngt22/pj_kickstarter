// ```arch ブロック（YAML）をシステム構成図として描画する。
// ページ遷移図（色の面にアイコンタイルのカード・曲線）やER図（青図）と見分けやすいよう、
// 淡いグレーの区画に白いカード（左に区画の色の帯・上に種類と技術名）を置き、角の丸い直角の線で結ぶ。
// 利用者は丸いピル、外部サービスの区画は点線の枠で描く
import { Button, Code, Group, Loader, Modal } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconApi,
  IconArrowsMaximize,
  IconBolt,
  IconBrowser,
  IconClock,
  IconCloud,
  IconDatabase,
  IconDeviceMobile,
  IconFolders,
  IconMail,
  IconServer2,
  IconShieldLock,
  IconStack2,
  IconUser,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";
import { useEffect, useId, useMemo, useState } from "react";
import { layoutArch, roundedPath, type ArchKind, type ArchLayout, type ArchNode, type ArchSpec } from "../lib/arch";
import { parseYaml } from "../lib/docs";
import { ICON_STROKE } from "./icons";
import Scaled from "./Scaled";

const PAD = 4;

const KINDS: Record<ArchKind, { icon: Icon; label: string }> = {
  user: { icon: IconUser, label: "利用者" },
  device: { icon: IconDeviceMobile, label: "端末" },
  web: { icon: IconBrowser, label: "Web" },
  app: { icon: IconDeviceMobile, label: "アプリ" },
  server: { icon: IconServer2, label: "サーバー" },
  function: { icon: IconBolt, label: "関数" },
  db: { icon: IconDatabase, label: "データベース" },
  storage: { icon: IconFolders, label: "ファイル保存" },
  auth: { icon: IconShieldLock, label: "認証" },
  queue: { icon: IconStack2, label: "キュー" },
  mail: { icon: IconMail, label: "メール" },
  external: { icon: IconApi, label: "外部API" },
  batch: { icon: IconClock, label: "定期処理" },
};

function Node({ n }: { n: ArchNode }) {
  const k = KINDS[n.kind] ?? { icon: IconCloud, label: n.kind };
  const I = k.icon;
  const style = { left: n.x, top: n.y, width: n.w, height: n.h, "--ar-color": `var(--mantine-color-${n.color}-filled)` } as React.CSSProperties;
  if (n.kind === "user")
    return (
      <div className="ar-user" style={style}>
        <span className="ar-user-icon"><I size={18} stroke={ICON_STROKE} /></span>
        <b>{n.name}</b>
      </div>
    );
  return (
    <div className="ar-card" data-kind={n.kind} data-external={n.external || undefined} style={style}>
      <span className="ar-meta">
        <I size={14} stroke={ICON_STROKE} />
        {n.tech ?? k.label}
      </span>
      <span className="ar-name">{n.name}</span>
      {n.note && <span className="ar-note">{n.note}</span>}
    </div>
  );
}

function Canvas({ layout, marker }: { layout: ArchLayout; marker: string }) {
  return (
    <div className="ar-canvas" style={{ width: layout.width + 2 * PAD, height: layout.height + 2 * PAD }}>
      <div style={{ position: "absolute", left: PAD, top: PAD }}>
        {layout.zones.map((z) => (
          <section
            key={z.id}
            className="ar-zone"
            data-external={z.external || undefined}
            style={{ left: z.x, top: z.y, width: z.w, height: z.h, "--ar-color": `var(--mantine-color-${z.color}-filled)` } as React.CSSProperties}
          >
            <header>
              <span className="ar-zone-tag">{z.name}</span>
              {z.note && <span className="ar-zone-note">{z.note}</span>}
            </header>
          </section>
        ))}
        <svg className="ar-links" width={layout.width} height={layout.height} aria-hidden>
          {layout.links.map((l) => (
            <path
              key={l.id}
              d={roundedPath(l.points)}
              className="ar-link"
              data-async={l.async || undefined}
              markerEnd={`url(#${marker})`}
              markerStart={l.both ? `url(#${marker})` : undefined}
            />
          ))}
        </svg>
        {layout.links.map((l) =>
          l.label && l.lx != null ? (
            <span key={l.id} className="ar-link-label" data-anchor={l.anchor} style={{ left: l.lx, top: l.ly }}>
              {l.label}
            </span>
          ) : null,
        )}
        {layout.nodes.map((n) => (
          <Node key={n.id} n={n} />
        ))}
      </div>
    </div>
  );
}

export default function ArchDiagram({ source }: { source: string }) {
  const marker = `ar-arrow-${useId().replace(/:/g, "")}`;
  const parsed = useMemo(() => {
    try {
      const spec = parseYaml<ArchSpec>(source);
      if (!Array.isArray(spec?.zones) || !Array.isArray(spec?.nodes)) throw new Error("zones と nodes を書いてください");
      return { spec, error: undefined };
    } catch (e) {
      return { spec: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);
  const [layout, setLayout] = useState<ArchLayout | string>();
  const [opened, { open, close }] = useDisclosure(false);
  const narrow = useMediaQuery("(max-width: 48em)") ?? false;

  useEffect(() => {
    if (!parsed.spec) return;
    let alive = true;
    layoutArch(parsed.spec, narrow)
      .then((l) => alive && setLayout(l))
      .catch((e) => alive && setLayout(String(e)));
    return () => {
      alive = false;
    };
  }, [parsed, narrow]);

  if (parsed.error) return <Code block c="red">システム構成図を読めません: {parsed.error}</Code>;
  if (typeof layout === "string") return <Code block c="red">システム構成図を配置できません: {layout}</Code>;
  if (!layout) return <Loader size="sm" />;

  const width = layout.width + 2 * PAD;
  const content = (
    <>
      <svg width={0} height={0} className="ar-defs" aria-hidden>
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M1,1 L9,5 L1,9" className="ar-arrow" />
          </marker>
        </defs>
      </svg>
      <Canvas layout={layout} marker={marker} />
      <figcaption className="ar-legend">
        <span><i className="ar-legend-line" />通信・呼び出し</span>
        {layout.hasAsync && <span><i className="ar-legend-line" data-async="" />非同期（通知・定期処理など）</span>}
        {layout.notes.map((n) => (
          <span key={n} className="ar-legend-note">{n}</span>
        ))}
      </figcaption>
    </>
  );
  return (
    <figure className="ar">
      <Group justify="flex-end" mb={4}>
        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconArrowsMaximize size={14} stroke={ICON_STROKE} />} onClick={open}>
          拡大して見る
        </Button>
      </Group>
      <Scaled width={width}>{content}</Scaled>
      <Modal opened={opened} onClose={close} fullScreen title="システム構成図">
        <div style={{ width }}>{content}</div>
      </Modal>
    </figure>
  );
}
