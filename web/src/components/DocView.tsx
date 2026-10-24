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
      <article>
        <h1>{doc.title}</h1>
        <Markdown text={stripFrontMatter(doc.body)} />
      </article>
    );
  }
  const View = YAML_VIEWS[doc.type];
  const data = parseYaml<Record<string, unknown>>(doc.body);
  return (
    <article>
      <h1>{doc.title}</h1>
      {View ? <View data={data} /> : <pre>{doc.body}</pre>}
    </article>
  );
}
