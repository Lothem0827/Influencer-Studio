import { defineConfig, loadEnv, type Plugin } from "vite";
import { resolve } from "node:path";

/** Emits manifest.json so the allowed app origins come from the build environment. */
function manifestPlugin(appOrigins: string[]): Plugin {
  return {
    name: "emit-manifest",
    generateBundle() {
      const manifest = {
        manifest_version: 3,
        name: "Influencer Studio for Flow",
        description: "Send prompts from Influencer Studio into Google Flow and bring results back. Never clicks Generate.",
        version: "0.1.0",
        permissions: ["sidePanel", "storage", "tabs"],
        host_permissions: [
          "https://flow.google.com/*",
          "https://labs.google/*",
          // Where Flow serves generated media from (service worker downloads need these)
          "https://flow-content.google/*",
          "https://*.googleusercontent.com/*",
          "https://*.googleapis.com/*",
          "https://*.google.com/*",
        ],
        background: { service_worker: "background.js", type: "module" },
        side_panel: { default_path: "sidepanel.html" },
        action: { default_title: "Influencer Studio" },
        content_scripts: [
          {
            matches: ["https://flow.google.com/*", "https://labs.google/*flow*"],
            js: ["content.js"],
            run_at: "document_idle",
          },
        ],
        externally_connectable: { matches: appOrigins.map((o) => `${o}/*`) },
      };
      this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify(manifest, null, 2) });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Also read the app's .env.local so the local build can default to its EXTENSION_API_TOKEN.
  const env = { ...loadEnv(mode, resolve(__dirname, ".."), ""), ...loadEnv(mode, process.cwd(), "") };
  // Comma separated list, e.g. "http://localhost:3000,https://studio.example.com"
  const origins = (env.APP_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    base: "./",
    css: { postcss: {} }, // do not pick up the Next.js app's PostCSS config
    plugins: [manifestPlugin(origins)],
    define: { __DEFAULT_APP_ORIGIN__: JSON.stringify(origins[0]), __DEFAULT_TOKEN__: JSON.stringify(env.EXTENSION_API_TOKEN ?? "") },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "es2022",
      minify: false,
      rollupOptions: {
        input: {
          background: resolve(__dirname, "src/background.ts"),
          sidepanel: resolve(__dirname, "sidepanel.html"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  };
});
