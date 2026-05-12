#!/usr/bin/env bun
/**
 * Static-site build for CodingWise.
 *
 * Uses Bun's built-in bundler — no third-party build deps.
 *   - HTML entry: ./src/index.html
 *   - JS:  bundled, minified, hashed
 *   - CSS: bundled, minified, hashed
 *   - Assets referenced from HTML get hashed and copied
 *   - Static files under ./public/ are mirrored into ./dist/ verbatim
 *     (CNAME, .nojekyll, robots.txt, sitemap.xml, etc.)
 *
 * `bun run build` produces ./dist/.
 * `bun run dev`   serves ./src/ with bun's dev server.
 */
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = import.meta.dir;
const SRC = resolve(ROOT, "src");
const PUBLIC = resolve(ROOT, "public");
const OUT = resolve(ROOT, "dist");

const isServe = process.argv.includes("--serve");

if (isServe) {
  // Dev server: serves HTML entrypoints, hot-reloads on change.
  // No minification — fast iteration only.
  Bun.serve({
    port: 5173,
    development: { hmr: true },
    routes: {
      "/": new Response(await Bun.file(join(SRC, "index.html")).bytes(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    },
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = join(SRC, path);
      const publicPath = join(PUBLIC, path);
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        return new Response(Bun.file(filePath));
      }
      if (existsSync(publicPath) && statSync(publicPath).isFile()) {
        return new Response(Bun.file(publicPath));
      }
      return new Response("Not found", { status: 404 });
    },
  });
  console.log("dev → http://localhost:5173");
} else {
  // Production build.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(SRC, "index.html")],
    outdir: OUT,
    minify: true,
    sourcemap: "linked",
    target: "browser",
    naming: {
      entry: "[name].[ext]",
      asset: "assets/[name]-[hash].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  // Mirror public/ (CNAME, .nojekyll, robots.txt, sitemap.xml) into dist/.
  if (existsSync(PUBLIC)) {
    cpSync(PUBLIC, OUT, { recursive: true });
  }

  // Report what got built.
  let totalBytes = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else totalBytes += s.size;
    }
  };
  walk(OUT);
  const kb = (totalBytes / 1024).toFixed(1);
  console.log(`✓ built ${result.outputs.length} file(s) → ${OUT} (${kb} kB total)`);
}
