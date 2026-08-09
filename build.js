#!/usr/bin/env bun
/**
 * Static-site build for CodingWise.
 *
 * Uses Bun's built-in bundler — no third-party build deps.
 *   - HTML entries: ./src/index.html, ./src/<page>/index.html
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

// Every HTML entry point, as a path relative to src/. The output mirrors this
// layout, so "bootcamp/index.html" is served at /bootcamp/.
const PAGES = ["index.html", "bootcamp/index.html"];

if (isServe) {
  // Dev server: serves the HTML entries through Bun's bundler, which injects
  // the HMR runtime so edits to index.html / main.js / styles.css hot-reload.
  const routes = {};
  for (const page of PAGES) {
    const mod = await import(`./src/${page}`);
    const dir = page.replace(/\/?index\.html$/, "");
    if (!dir) {
      routes["/"] = mod.default;
      continue;
    }
    routes[`/${dir}`] = mod.default;
    routes[`/${dir}/`] = mod.default;
  }

  Bun.serve({
    port: 5173,
    development: { hmr: true },
    routes,
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
    entrypoints: PAGES.map((page) => join(SRC, page)),
    outdir: OUT,
    root: SRC,
    minify: true,
    sourcemap: "linked",
    target: "browser",
    naming: {
      entry: "[dir]/[name].[ext]",
      asset: "assets/[name]-[hash].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  const criticalCss = await buildCriticalCss();
  for (const page of PAGES) {
    finishHtml(join(OUT, page), criticalCss);
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

/**
 * Builds src/critical.css standalone and returns the minified CSS. Bun's HTML
 * bundler would otherwise merge it into the main CSS chunk, which defeats the
 * point of having a separate above-the-fold sheet.
 *
 * @returns {Promise<string|null>} null when src/critical.css doesn't exist.
 */
async function buildCriticalCss() {
  const criticalSrc = join(SRC, "critical.css");
  if (!existsSync(criticalSrc)) return null;

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
  rmSync(tmpDir, { recursive: true, force: true });
  return css;
}

/** Rewrites a built HTML file in place: inline critical CSS, favicons, deferred stylesheet. */
function finishHtml(htmlPath, criticalCss) {
  let html = readFileSync(htmlPath, "utf8");

  // CSS strategy: inline the small critical stylesheet so the header + hero
  // paint without layout shift, and defer the full stylesheet via preload +
  // onload swap so it doesn't block first paint.
  if (criticalCss) {
    html = html.replace(/<!--\s*critical-css\s*-->/, `<style>${criticalCss}</style>`);
  }

  // Favicon links point to files in public/ (mirrored to the site root), so
  // they bypass Bun's HTML bundler — which would otherwise fail to resolve
  // root-relative hrefs from src/.
  const faviconLinks = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">',
    '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
  ].join("\n    ");
  html = html.replace(/<!--\s*favicons\s*-->/, faviconLinks);

  const deferRe = /<link\s+rel="stylesheet"([^>]*?)href="((?:\.{1,2}\/)+assets\/[^"]+\.css)"([^>]*?)>/g;
  html = html.replace(deferRe, (_m, pre, href, post) => {
    const attrs = `${pre}${post}`.trim();
    const extra = attrs ? ` ${attrs}` : "";
    return (
      `<link rel="preload" as="style" href="${href}"${extra} onload="this.onload=null;this.rel='stylesheet'">` +
      `<noscript><link rel="stylesheet" href="${href}"${extra}></noscript>`
    );
  });

  writeFileSync(htmlPath, html);
}
