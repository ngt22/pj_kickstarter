import { Alert, Box, Button, Group, Loader, Text } from "@mantine/core";
import { IconArrowLeft, IconFileTypePdf } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DocView from "../components/DocView";
import { ICON_STROKE } from "../components/icons";
import ProjectCover from "../components/ProjectCover";
import type { DocRecord, ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";
import { loadProject } from "../lib/loadProject";
import { PrintContext } from "../lib/print";
import { ProjectColorContext } from "../lib/projectColor";
import { EMPTY_SITE, loadSiteSettings, type SiteSettings } from "../lib/settings";

// 用紙は A4 横。ほかのページの印刷には効かないよう、このページを開いている間だけ入れる
const PAGE_CSS = `@page {
  size: A4 landscape;
  margin: 12mm 12mm 14mm;
  @bottom-right { content: counter(page) " / " counter(pages); font-size: 8pt; color: #868e96; }
}`;

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
      <style>{PAGE_CSS}</style>
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
            <Box ref={sheet} className="ks-print-sheet">
              <section className="ks-print-page">
                <ProjectCover project={data.project} docs={data.docs} site={site} />
              </section>
              {data.docs.map((d, i) => (
                <section key={d.type} id={`doc-${d.type}`} className="ks-print-page">
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
