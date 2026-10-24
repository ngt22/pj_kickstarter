import { Paper, Title, Typography } from "@mantine/core";
import { parseYaml, stripFrontMatter, type DocRecord } from "../lib/docs";
import Markdown from "./Markdown";
import { ApiView, EstimateView, GlossaryView, RisksView } from "./YamlViews";

const YAML_VIEWS: Record<string, (props: { data: any }) => React.ReactElement> = {
  glossary: GlossaryView,
  risks: RisksView,
  estimate: EstimateView,
  api: ApiView,
};

export default function DocView({ doc }: { doc: DocRecord }) {
  if (doc.format === "markdown") {
    return (
      <Paper component="article" withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
        <Title order={1} mb="lg">{doc.title}</Title>
        <Typography className="doc-body">
          <Markdown text={stripFrontMatter(doc.body)} />
        </Typography>
      </Paper>
    );
  }
  const View = YAML_VIEWS[doc.type];
  const data = parseYaml<Record<string, unknown>>(doc.body);
  return (
    <Paper component="article" withBorder shadow="xs" p={{ base: "lg", sm: "xl" }}>
      <Title order={1} mb="lg">{doc.title}</Title>
      {View ? <View data={data} /> : <pre>{doc.body}</pre>}
    </Paper>
  );
}
