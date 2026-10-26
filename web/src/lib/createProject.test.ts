import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTemplate } from "./createProject";

const dir = new URL("../../../ingest/src/kickstarter_ingest/templates/", import.meta.url);
const files = readdirSync(dir).filter((f) => f !== "project.yaml");

describe("雛形の読み込み", () => {
  it("16種すべての雛形から title を読める", () => {
    expect(files).toHaveLength(16);
    const docs = files.map((f, i) => {
      const [type, ext] = f.split(".");
      return parseTemplate(type, ext === "md" ? "markdown" : "yaml", readFileSync(new URL(f, dir), "utf-8"), i + 1);
    });
    expect(docs.find((d) => d.type === "requirements")?.title).toBe("要件定義書");
    expect(docs.find((d) => d.type === "risks")?.title).toBe("リスク管理表");
    expect(docs.find((d) => d.type === "operations")?.title).toBe("運用・保守");
  });

  it("front matter がない Markdown はエラーにする", () => {
    expect(() => parseTemplate("adr", "markdown", "# ADR", 16)).toThrow();
  });
});
