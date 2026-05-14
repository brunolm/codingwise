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
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = import.meta.dir;
const SRC = resolve(ROOT, "src");
const PUBLIC = resolve(ROOT, "public");
const OUT = resolve(ROOT, "dist");

const isServe = process.argv.includes("--serve");

if (isServe) {
  // Dev server: serves the HTML entry through Bun's bundler, which injects
  // the HMR runtime so edits to index.html / main.js / styles.css hot-reload.
  const index = await import("./src/index.html");
  Bun.serve({
    port: 5173,
    development: { hmr: true },
    routes: {
      "/": index.default,
    },
    async fetch(req) {
      // Fallback for files in public/ (CNAME, robots.txt, etc.).
      const url = new URL(req.url);
      const publicPath = join(PUBLIC, url.pathname);
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

  // CSS strategy: inline the small critical stylesheet so the header + hero
  // paint without layout shift, and defer the full stylesheet via preload +
  // onload swap so it doesn't block first paint.
  const htmlPath = join(OUT, "index.html");
  let html = readFileSync(htmlPath, "utf8");

  // 1) Build src/critical.css standalone (Bun's HTML bundler would otherwise
  //    merge it into the main CSS chunk), then inline it where the
  //    <!-- critical-css --> placeholder sits in the source HTML.
  const criticalSrc = join(SRC, "critical.css");
  if (existsSync(criticalSrc)) {
    const tmpDir = join(OUT, "__critical_tmp");
    mkdirSync(tmpDir, { recursive: true });
    const criticalResult = await Bun.build({
      entrypoints: [criticalSrc],
      outdir: tmpDir,
      minify: true,
      target: "browser",
    });
    if (!criticalResult.success) {
      for (const log of criticalResult.logs) console.error(log);
      process.exit(1);
    }
    const builtCss = criticalResult.outputs.find((o) => o.path.endsWith(".css"));
    const css = await Bun.file(builtCss.path).text();
    html = html.replace(/<!--\s*critical-css\s*-->/, `<style>${css}</style>`);
    rmSync(tmpDir, { recursive: true, force: true });
  }

  // 2) Inject favicon links. These point to files in public/ (mirrored to the
  //    site root), so they bypass Bun's HTML bundler — which would otherwise
  //    fail to resolve root-relative hrefs from src/.
  const faviconLinks = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">',
    '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join("\n    ");
  html = html.replace(/<!--\s*favicons\s*-->/, faviconLinks);

  // 3) Defer the main stylesheet via preload + onload swap.
  const deferRe = /<link\s+rel="stylesheet"([^>]*?)href="(\.\/assets\/[^"]+\.css)"([^>]*?)>/g;
  html = html.replace(
    deferRe,
    (_m, pre, href, post) => {
      const attrs = `${pre}${post}`.trim();
      const extra = attrs ? ` ${attrs}` : "";
      return (
        `<link rel="preload" as="style" href="${href}"${extra} onload="this.onload=null;this.rel='stylesheet'">` +
        `<noscript><link rel="stylesheet" href="${href}"${extra}></noscript>`
      );
    },
  );
  writeFileSync(htmlPath, html);

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
