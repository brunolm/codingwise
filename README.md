# codingwise.com

Static website for [codingwise.com](https://codingwise.com/) — built with
plain HTML/CSS/JS, bundled and minified by [Bun](https://bun.sh)'s native
bundler, deployed to GitHub Pages.

No frameworks. No npm dependencies. The whole thing compresses to ~20 kB.

## Project layout

```
.
├── src/                # source HTML, CSS, JS, and bundler-resolved assets
│   ├── index.html      # entry point — Bun's HTML bundler walks links from here
│   ├── styles.css
│   ├── main.js
│   └── assets/         # logos, etc. — referenced from HTML/CSS, get hashed at build
├── public/             # static files copied verbatim into dist/ (no hashing)
│   ├── CNAME           # GitHub Pages custom domain
│   ├── .nojekyll       # tells GH Pages to skip Jekyll processing
│   ├── robots.txt
│   ├── sitemap.xml
│   └── assets/         # files referenced by absolute URL (e.g. OG image)
├── build.js            # the entire build pipeline
├── bunfig.toml         # bun install config (minimumReleaseAge, exact pins)
├── .tool-versions      # bun version pin — read by mise and by CI's setup-bun
└── .github/workflows/deploy.yml
```

## Prerequisites

- [mise](https://mise.jdx.dev/) — manages the bun version from `.tool-versions`
- Or just bun directly, version matching `.tool-versions`

```sh
# with mise
mise install
# or, manually
curl -fsSL https://bun.sh/install | bash
```

## Develop

```sh
bun run dev
```

Serves on <http://localhost:5173>. No hot module replacement for HTML/CSS — a
browser refresh is enough for a site this small.

## Build

```sh
bun run build
```

Produces `dist/`. The pipeline is `build.js` (~80 lines, no deps) and uses
Bun's built-in bundler:

| Input                          | Output                                      |
| ------------------------------ | ------------------------------------------- |
| `src/index.html`               | `dist/index.html` (rewritten with hashed asset URLs) |
| `src/main.js`                  | `dist/assets/index-[hash].js` (minified, sourcemapped) |
| `src/styles.css`               | `dist/assets/index-[hash].css` (minified, sourcemapped) |
| `src/assets/*.svg` (referenced)| `dist/assets/[name]-[hash].svg`             |
| `public/**`                    | `dist/**` (copied verbatim — CNAME, .nojekyll, robots, sitemap, OG image) |

Total page weight after build is ~20 kB. The `linkedin-banner.png` ships at
its original size because it's only fetched by social-card scrapers.

## Hosting on GitHub Pages

Deploy is fully automated by `.github/workflows/deploy.yml`. The flow:

1. Push to `main`.
2. Workflow builds `dist/`, uploads it as a Pages artifact, deploys via
   `actions/deploy-pages`.
3. `dist/CNAME` instructs GitHub Pages to serve under `codingwise.com`.
4. Cloudflare DNS points `codingwise.com` and `www.codingwise.com` at
   GitHub's Pages servers (DNS-only / unproxied so GitHub's Let's Encrypt
   cert provisioning works).

### One-time setup on GitHub

In the repo's **Settings → Pages**:

- **Source:** GitHub Actions
- **Custom domain:** `codingwise.com`
- **Enforce HTTPS:** on (enable once GitHub finishes provisioning the cert
  — usually a few minutes after DNS resolves)

### One-time DNS setup

Apex (`codingwise.com`) — four A records, DNS-only (gray cloud):

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

`www.codingwise.com` — CNAME to `brunolm.github.io`, DNS-only.

Optional but recommended — AAAA records for IPv6:

```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

## Supply-chain hardening

- `bunfig.toml` sets `minimumReleaseAge = 259200` (3 days). Any package
  version published less than 3 days ago will be refused. This wouldn't have
  prevented every recent supply-chain incident, but it would have caught the
  short-window TanStack compromise where the malicious version was yanked
  within hours.
- `exact = true` — exact versions only, no caret/tilde ranges.
- All GitHub Actions are pinned to full commit SHAs (the `# v4` style
  comment next to each `uses:` is human-readable; the SHA is the truth).
- Workflow `permissions:` default to `{}`; each job re-declares the minimum.
- No PR triggers — only `push: main` and manual `workflow_dispatch`.

## License

All rights reserved. Source published for transparency.
