import { Alert, Box, Button, Group, Loader, Text } from "@mantine/core";
import { IconArrowLeft, IconFileTypePdf } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DocView from "../components/DocView";
import { ICON_STROKE } from "../components/icons";
import { PrintCover, PrintOverview, PrintToc } from "../components/PrintFront";
import type { DocRecord, ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";
import { loadProject } from "../lib/loadProject";
import { PrintContext } from "../lib/print";
import { ProjectColorContext } from "../lib/projectColor";
import { EMPTY_SITE, loadSiteSettings, type SiteSettings } from "../lib/settings";

import "../print.css";

const longDate = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

// CSS の content に入れる文字列
const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

// 用紙（A4 縦）と柱。ほかのページの印刷には効かないよう、このページを開いている間だけ入れる。
// 柱：上左に案件名、上右に資料番号と資料名（資料ごとの名前付きページ）、下に提案者・版と提案日・ページ番号。表紙には入れない
function pageCss(project: ProjectRecord, docs: DocRecord[], site: SiteSettings) {
  const box = `font-family: "Noto Sans JP", sans-serif; font-size: 7.5pt; color: #8a909b;`;
  const edition = [project.version && `第${project.version}版`, project.proposed_at && longDate.format(new Date(project.proposed_at))]
    .filter(Boolean)
    .join("　");
  const vendor = [site.vendor_name, "Confidential"].filter(Boolean).join("　");
  return [
    `@page {
  size: A4 portrait;
  margin: 20mm 18mm 18mm;
  @top-left { content: ${cssString(`${project.name}　ご提案書`)}; ${box} vertical-align: bottom; padding-bottom: 4mm; }
  @bottom-left { content: ${cssString(vendor)}; ${box} vertical-align: top; padding-top: 4mm; }
  @bottom-center { content: ${cssString(edition)}; ${box} vertical-align: top; padding-top: 4mm; }
  @bottom-right { content: counter(page); ${box} vertical-align: top; padding-top: 4mm; }
}`,
    `@page cover { @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }`,
    ...docs.map(
      (d, i) => `@page doc-${i} { @top-right { content: ${cssString(`${i + 1}　${d.title}`)}; ${box} vertical-align: bottom; padding-bottom: 4mm; } }`,
    ),
  ].join("\n");
}

// PDF の既定のファイル名になる（ブラウザはページのタイトルをファイル名に使う）
function fileTitle(p: ProjectRecord) {
  return [p.name, "提案資料", p.version && `第${p.version}版`, p.proposed_at].filter(Boolean).join("_");
}

// 図（ELK の配置・遅延読み込み・mermaid）とフォントが描き終わり、高さが落ち着いたら true
function useSettled(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let last = -1;
    let stable = 0;
    const t = window.setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const busy =
        document.fonts.status !== "loaded" || !!el.querySelector(".mantine-Loader-root, [data-print-pending], .mermaid:empty");
      const h = el.scrollHeight;
      stable = !busy && h === last ? stable + 1 : 0;
      last = h;
      if (stable >= 3) {
        setSettled(true);
        window.clearInterval(t);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [ref, enabled]);
  return settled;
}

// 表紙と全資料を 1 枚に並べ、ブラウザの印刷（PDF に保存）で 1 つの PDF にする。付箋は出さない
export default function ProjectPrint() {
  const { projectId = "" } = useParams();
  const [data, setData] = useState<{ project: ProjectRecord; docs: DocRecord[] } | null>(null);
  const [site, setSite] = useState<SiteSettings>(EMPTY_SITE);
  const [error, setError] = useState("");
  const sheet = useRef<HTMLDivElement>(null);
  const settled = useSettled(sheet, !!data);
  const printed = useRef(false);

  useEffect(() => {
    loadProject(projectId).then(setData).catch((e) => setError(String(e)));
    loadSiteSettings(db).then(setSite).catch(() => setSite(EMPTY_SITE));
  }, [projectId]);

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = fileTitle(data.project);
    return () => {
      document.title = prev;
    };
  }, [data]);

  // 開いたら、描き終わるのを待って一度だけ印刷画面を出す
  useEffect(() => {
    if (!settled || printed.current) return;
    printed.current = true;
    window.print();
  }, [settled]);

  const base = `/projects/${projectId}`;
  return (
    <div className="ks-print-screen">
      {data && <style>{pageCss(data.project, data.docs, site)}</style>}
      <Group className="ks-print-toolbar" justify="space-between" wrap="nowrap" gap="sm">
        <Button component={Link} to={base} variant="subtle" size="xs" leftSection={<IconArrowLeft size={16} stroke={ICON_STROKE} />}>
          資料に戻る
        </Button>
        <Text size="xs" c="dimmed" visibleFrom="sm" className="ks-print-hint">
          印刷画面の送信先で「PDF に保存」を選んでください。「ヘッダーとフッター」をオフにすると、余白に URL や日付が入りません。
        </Text>
        <Button
          size="xs"
          leftSection={settled ? <IconFileTypePdf size={16} stroke={ICON_STROKE} /> : <Loader size={14} color="white" />}
          disabled={!settled}
          onClick={() => window.print()}
        >
          {settled ? "PDF に保存" : "図を準備しています"}
        </Button>
      </Group>

      {error && <Alert color="red" title="読み込めませんでした" m="md">{error}</Alert>}
      {data && (
        <PrintContext.Provider value={true}>
          <ProjectColorContext.Provider value={data.project.color || "brand"}>
            <Box ref={sheet} className="ks-print-sheet ks-paper">
              {/* 下書きの案件は、全ページに DRAFT の透かしを入れる */}
              {data.project.status === "draft" && <div className="ks-draft-mark" aria-hidden>DRAFT</div>}
              <section className="ks-print-page" style={{ page: "cover" }}>
                <PrintCover project={data.project} site={site} />
              </section>
              <section className="ks-print-page">
                <PrintToc docs={data.docs} />
              </section>
              <section className="ks-print-page">
                <PrintOverview project={data.project} docs={data.docs} site={site} />
              </section>
              {data.docs.map((d, i) => (
                <section key={d.type} id={`doc-${d.type}`} className="ks-print-page" style={{ page: `doc-${i}` }}>
                  <DocView doc={d} index={i} total={data.docs.length} basePath={base} />
                </section>
              ))}
            </Box>
          </ProjectColorContext.Provider>
        </PrintContext.Provider>
      )}
    </div>
  );
}
