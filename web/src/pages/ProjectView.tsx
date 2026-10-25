import { Alert, Box, Button, NavLink, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { IconFileOff, IconHome } from "@tabler/icons-react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
    const ref = doc(db, "projects", projectId);
    Promise.all([getDoc(ref), getDocs(collection(ref, "docs"))])
      .then(([p, d]) => {
        setProject({ ...(p.data() as ProjectRecord), id: projectId });
        setDocs(d.docs.map((x) => x.data() as DocRecord).sort((a, b) => a.order - b.order));
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

  return (
    <AnnotationProvider projectId={projectId} projectName={project.name} docType={docType} pageTitles={pageTitles}>
      <Layout sidebar={sidebar} actions={<AnnotationButtons />}>
        <AnnotationLayer>{content}</AnnotationLayer>
        <AnnotationList />
      </Layout>
    </AnnotationProvider>
  );
}
