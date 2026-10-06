import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

// Content scripts must be a single classic script, so they get their own IIFE build.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, resolve(__dirname, ".."), ""), ...loadEnv(mode, process.cwd(), "") };
  const origin = (env.APP_ORIGINS ?? "http://localhost:3000").split(",")[0].trim();
  return {
    css: { postcss: {} },
    define: { __DEFAULT_APP_ORIGIN__: JSON.stringify(origin), __DEFAULT_TOKEN__: JSON.stringify(env.EXTENSION_API_TOKEN ?? "") },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      target: "es2022",
      minify: false,
      lib: {
        entry: resolve(__dirname, "src/content.ts"),
        formats: ["iife" as const],
        name: "InfluencerStudioContent",
        fileName: () => "content.js",
      },
    },
  };
});
