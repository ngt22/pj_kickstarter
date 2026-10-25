import { readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkStripComments } from "./Markdown";

const render = (text: string) =>
  renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm, remarkStripComments]}>{text}</ReactMarkdown>);

describe("HTML コメント", () => {
  it("段落の間のコメントは表示しない", () => {
    const html = render("前\n\n<!--\n```er の書き方\n  domains: ...\n-->\n\n後");
    expect(html).not.toContain("domains");
    expect(html).not.toContain("&lt;!--");
    expect(html).toContain("後");
  });

  it("雛形のどの Markdown にもコメントが文字として残らない", () => {
    const dir = new URL("../../../templates/", import.meta.url);
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const body = readFileSync(new URL(name, dir), "utf-8").replace(/^---[\s\S]*?---\n/, "");
      expect(render(body), name).not.toContain("&lt;!--");
    }
  });
});
