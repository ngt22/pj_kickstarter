import { Group, Paper, SimpleGrid, Text, Title, Typography, UnstyledButton } from "@mantine/core";
import { Link } from "react-router-dom";
import { parseYaml, stripFrontMatter, type DocRecord } from "../lib/docs";
import { usePrint } from "../lib/print";
import Markdown from "./Markdown";
import { ApiView, EstimateView, GlossaryView, RisksView } from "./YamlViews";

const YAML_VIEWS: Record<string, (props: { data: any }) => React.ReactElement> = {
  glossary: GlossaryView,
  risks: RisksView,
  estimate: EstimateView,
  api: ApiView,
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" });

type Props = {
  doc: DocRecord;
  index: number;
  total: number;
  prev?: DocRecord;
  next?: DocRecord;
  basePath: string;
};

function Pager({ label, doc, basePath, align }: { label: string; doc?: DocRecord; basePath: string; align: "left" | "right" }) {
  if (!doc) return <div />;
  return (
    <UnstyledButton component={Link} to={`${basePath}/${doc.type}`} className="ks-pager" ta={align}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="sm">{doc.title}</Text>
    </UnstyledButton>
  );
}

export default function DocView({ doc, index, total, prev, next, basePath }: Props) {
  const print = usePrint();
  const updated = doc.updatedAt?.toDate();
  const body =
    doc.format === "markdown" ? (
      <Typography className="doc-body">
        <Markdown text={stripFrontMatter(doc.body)} />
      </Typography>
    ) : (
      (() => {
        const View = YAML_VIEWS[doc.type];
        return View ? <View data={parseYaml<Record<string, unknown>>(doc.body)} /> : <pre>{doc.body}</pre>;
      })()
    );

  // PDF では画面用の紙（枠と影）・「DOCUMENT 01 / 14」・最終更新を出さず、資料番号と資料名だけを見出しにする
  if (print)
    return (
      <article className="ks-paper-doc">
        <header className="ks-paper-head">
          <h1>
            <span className="ks-paper-num">{index + 1}</span>
            {doc.title}
          </h1>
        </header>
        {body}
      </article>
    );

  return (
    <>
      <Paper component="article" withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
        <header className="ks-doc-header">
          <Group justify="space-between" align="baseline" gap="xs">
            <Text className="ks-eyebrow">DOCUMENT {pad2(index + 1)} / {pad2(total)}</Text>
            {updated && <Text size="xs" c="dimmed">最終更新 {dateFmt.format(updated)}</Text>}
          </Group>
          <Title order={1} mt={4}>{doc.title}</Title>
        </header>
        {body}
      </Paper>
      <SimpleGrid cols={{ base: 1, xs: 2 }} mt="lg" spacing="md">
        <Pager label="← 前のドキュメント" doc={prev} basePath={basePath} align="left" />
        <Pager label="次のドキュメント →" doc={next} basePath={basePath} align="right" />
      </SimpleGrid>
    </>
  );
}
