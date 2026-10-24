import { defineConfig, loadEnv, type Plugin } from "vite";
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), cliConfig(mode)],
  build: { outDir: "dist" },
}));
