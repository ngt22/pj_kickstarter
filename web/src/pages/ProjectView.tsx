import { ActionIcon, Alert, Box, Button, NavLink, Paper, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import { IconFileOff, IconFileTypePdf, IconHome } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AnnotationButtons from "../components/annotations/AnnotationButtons";
import { AnnotationProvider } from "../components/annotations/AnnotationContext";
import AnnotationLayer from "../components/annotations/AnnotationLayer";
import AnnotationList from "../components/annotations/AnnotationList";
import DocView from "../components/DocView";
import EmptyState from "../components/EmptyState";
import { DocIcon, ICON_STROKE } from "../components/icons";
import Layout from "../components/Layout";
import ProjectCover from "../components/ProjectCover";
import { COVER } from "../lib/annotations";
import type { DocRecord, ProjectRecord } from "../lib/docs";
import { db } from "../lib/firebase";
import { loadProject } from "../lib/loadProject";
import { ProjectColorContext } from "../lib/projectColor";
import { EMPTY_SITE, loadSiteSettings, type SiteSettings } from "../lib/settings";

// 読み込み中は、表示される紙と同じ形の骨組みを出す（画面が跳ねないように）
function DocSkeleton() {
  return (
    <Paper withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
      <Skeleton h={12} w={140} mb="sm" />
      <Skeleton h={32} w="45%" mb="xl" />
      <Stack gap="sm">
        <Skeleton h={14} />
        <Skeleton h={14} w="92%" />
        <Skeleton h={14} w="75%" />
        <Skeleton h={160} mt="md" />
      </Stack>
    </Paper>
  );
}

export default function ProjectView() {
  const { projectId = "", docType } = useParams();
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [docs, setDocs] = useState<DocRecord[] | null>(null);
  const [site, setSite] = useState<SiteSettings>(EMPTY_SITE);
  const [error, setError] = useState("");
  const pageTitles = useMemo(
    () => Object.fromEntries([[COVER, "表紙・概要"], ...(docs ?? []).map((d) => [d.type, d.title])]),
    [docs],
  );

  useEffect(() => {
    setError("");
    loadProject(projectId)
      .then((r) => {
        setProject(r.project);
        setDocs(r.docs);
      })
      .catch((e) => setError(String(e)));
    // 提案者は表紙の補足なので、読めなくても資料は表示する
    loadSiteSettings(db).then(setSite).catch(() => setSite(EMPTY_SITE));
  }, [projectId]);

  if (error) return <Layout><Alert color="red" title="読み込めませんでした">{error}</Alert></Layout>;
  if (!docs || !project) return <Layout><DocSkeleton /></Layout>;

  const base = `/projects/${projectId}`;
  const i = docs.findIndex((d) => d.type === docType);
  const current = docs[i];
  const sidebar = (
    <>
      <Box px="sm" pb="md" mb="xs" className="ks-nav-head">
        <Text className="ks-eyebrow">提案資料</Text>
        <Text fw={700} lh={1.5} mt={2}>{project.name}</Text>
      </Box>
      <NavLink
        component={Link}
        to={base}
        leftSection={<IconHome size={18} stroke={ICON_STROKE} />}
        label="表紙・概要"
        active={!docType}
        mb={4}
      />
      {docs.map((d) => (
        <NavLink
          key={d.type}
          component={Link}
          to={`${base}/${d.type}`}
          leftSection={<DocIcon type={d.type} />}
          label={d.title}
          active={d.type === docType}
        />
      ))}
    </>
  );

  let content;
  if (!docType) content = <ProjectCover project={project} docs={docs} site={site} />;
  else if (current)
    content = (
      <ProjectColorContext.Provider value={project.color || "brand"}>
        <DocView doc={current} index={i} total={docs.length} prev={docs[i - 1]} next={docs[i + 1]} basePath={base} />
      </ProjectColorContext.Provider>
    );
  else
    content = (
      <EmptyState
        icon={IconFileOff}
        title="ドキュメントが見つかりません"
        action={<Button component={Link} to={base} variant="light">表紙に戻る</Button>}
      >
        この案件には「{docType}」のドキュメントがありません。原稿を追加したら ingest CLI で push してください。
      </EmptyState>
    );

  // PDF は別のタブで、付箋を出さずに全資料を並べて開く
  const actions = (
    <>
      <Tooltip label="全資料を 1 つの PDF で保存">
        <ActionIcon component={Link} to={`${base}/print`} target="_blank" variant="default" size="md" aria-label="全資料を PDF で保存">
          <IconFileTypePdf size={18} stroke={ICON_STROKE} />
        </ActionIcon>
      </Tooltip>
      <AnnotationButtons />
    </>
  );

  return (
    <AnnotationProvider projectId={projectId} projectName={project.name} docType={docType} pageTitles={pageTitles}>
      <Layout sidebar={sidebar} actions={actions}>
        <AnnotationLayer>{content}</AnnotationLayer>
        <AnnotationList />
      </Layout>
    </AnnotationProvider>
  );
}
