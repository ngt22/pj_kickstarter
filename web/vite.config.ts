import type { ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// ingest CLI の login が読む設定。Web API キーとプロジェクトIDは JS にも含まれる公開情報なので、そのまま出してよい
function cliConfig(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    name: "cli-config",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "cli-config.json",
        source: JSON.stringify({ apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID }),
      });
    },
  };
}

// 開発・プレビューのサーバーは llms.txt や雛形を charset なしの text/plain などで返し、ブラウザで日本語が文字化けする。
// 本番は firebase.json の headers で付けている
function utf8Text(): Plugin {
  const middleware: Connect.NextHandleFunction = (_req, res: ServerResponse, next) => {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (name.toLowerCase() === "content-type" && /^(text\/|application\/json)/.test(String(value)) && !/charset/i.test(String(value))) {
        value = `${value}; charset=utf-8`;
      }
      return setHeader(name, value);
    };
    next();
  };
  return {
    name: "utf8-text",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), cliConfig(mode), utf8Text()],
  build: { outDir: "dist" },
}));
