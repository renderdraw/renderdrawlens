import { defineConfig, Plugin } from "vite";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

// Plugin to inline chunk imports into content.js and background.js after build.
// Chrome MV3 content scripts don't support ES module imports, so we must
// inline all shared chunks into a single self-contained file.
function inlineContentScript(): Plugin {
  return {
    name: "inline-content-script",
    closeBundle() {
      for (const entry of ["content.js", "background.js"]) {
        const filePath = resolve(__dirname, "dist", entry);
        if (!existsSync(filePath)) continue;

        let code = readFileSync(filePath, "utf-8");

        // Find and inline chunk imports
        const importRegex = /import\s*\{([^}]+)\}\s*from\s*'([^']+)';?\n?/g;
        let match;
        // Collect all matches first to avoid regex state issues
        const matches: Array<{ full: string; path: string }> = [];
        while ((match = importRegex.exec(code)) !== null) {
          matches.push({ full: match[0], path: match[2] });
        }

        for (const m of matches) {
          const chunkPath = resolve(__dirname, "dist", m.path);
          if (existsSync(chunkPath)) {
            const chunkCode = readFileSync(chunkPath, "utf-8")
              .replace(/^export\s*\{[^}]+\};?\s*$/gm, "")
              .replace(/export\s+/g, "");
            code = code.replace(m.full, chunkCode + "\n");
          }
        }

        // Remove any remaining import statements
        code = code.replace(/import\s*\{[^}]+\}\s*from\s*'[^']+';?\n?/g, "");

        // Wrap content script in IIFE to avoid global scope pollution
        if (entry === "content.js") {
          code = `(function() {\n${code}\n})();`;
        }

        writeFileSync(filePath, code);
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [inlineContentScript()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/service-worker.ts"),
        content: resolve(__dirname, "src/content/content.ts"),
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        popup: resolve(__dirname, "src/popup/index.html"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") return "background.js";
          if (chunkInfo.name === "content") return "content.js";
          return "[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  publicDir: "public",
});
