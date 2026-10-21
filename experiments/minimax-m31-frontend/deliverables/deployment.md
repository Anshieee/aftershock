# Netlify deployment — Aftershock. MiniMax M3.1 prototype preview

This prototype is published as a **separate, public Netlify site**. It is a
frontend-only design preview: no backend, no functions, no environment
variables, no database.

---

## The public URL

**https://aftershock-minimax-preview.netlify.app**

Share it freely. It is a public site with no access control — anyone with the
link (and anyone who discovers it) can open it.

## Site identity

| | |
|---|---|
| Site name | `aftershock-minimax-preview` |
| Site ID | `7ddb1d6e-1ef8-41e7-b494-bfc0243e8700` |
| Netlify team | SpaceApps (`riotisweird`, `614d517d245d1a54093f8de7`) |
| Admin URL | https://app.netlify.com/projects/aftershock-minimax-preview |
| Production URL | https://aftershock-minimax-preview.netlify.app |
| Branch deploy alias | https://experiment-minimax-m31-frontend--aftershock-minimax-preview.netlify.app |

**This is a different site from the production Aftershock deployment.** The
production site `aftershock-demo` (`b1bb72a1-23de-46c4-8af8-ad4c5010f041`)
at https://aftershock-demo.netlify.app/ was not modified, redeployed or
reconfigured in any way. It has its own site ID, its own deploy history and
its own Git configuration.

## GitHub connection

| | |
|---|---|
| Repository | `Anshieee/aftershock` (public) |
| Repository id | `1424410521` |
| Provider | `github` |
| Production branch for this site | `experiment/minimax-m31-frontend` |
| Allowed branches | `experiment/minimax-m31-frontend` only |
| Base directory | `experiments/minimax-m31-frontend` |
| Build command | `npm run build` |
| Publish directory | `dist` (relative to the base directory) |
| Node | 22 (`build.environment.NODE_VERSION`) |
| Deploy key | Netlify read-only deploy key `6ad82cdef99597ebbd9803ef` (GitHub key id `167133777`) |

Because `allowed_branches` contains only the experimental branch, a push to
`main` never builds this preview, and a push to the experimental branch
never builds the production site.

## Configuration files

Two files were added **inside the prototype directory only**:

- `experiments/minimax-m31-frontend/netlify.toml` — build command, publish
  directory, Node version and the SPA history fallback.
- `experiments/minimax-m31-frontend/public/_redirects` — the same SPA
  fallback in Netlify's plain-text format. Netlify serves a matching static
  file first, so the manuscript PDF, the PDF.js standard fonts and the built
  assets are unaffected.

The repository-root `netlify.toml` that configures the production Aftershock
site was **not** touched. Netlify reads the configuration from the site's
base directory, so the prototype's own file is the one that applies to this
site.

## How the site is built

Netlify clones the repository with the read-only deploy key, enters
`experiments/minimax-m31-frontend`, runs `npm install` and then
`npm run build` (`tsc --noEmit` followed by `vite build`), and publishes
`dist/`.

The published output is 33 files: `index.html`, `_redirects`, the hashed JS
and CSS bundles, the self-hosted font files, the PDF.js worker, the PDF.js
standard-font data, the generated sample manuscript and the favicon.

## Deploying by hand

```bash
cd experiments/minimax-m31-frontend
npm run build
npx netlify deploy --dir=dist --prod --site 7ddb1d6e-1ef8-41e7-b494-bfc0243e8700
```

## Verifying the deployed build

```bash
cd experiments/minimax-m31-frontend
npm run journey  https://aftershock-minimax-preview.netlify.app
npm run live-smoke https://aftershock-minimax-preview.netlify.app
```

`journey.mjs` walks the whole documented workflow against the given URL.
`live-smoke.mjs` additionally records every network request the page makes,
so it can prove that nothing is sent to the production Aftershock backend.

## What is deliberately absent

- No Netlify Functions, no `netlify/functions` directory, no redirects to
  `/.netlify/functions/*`.
- No environment variables — the bundle contains no credentials and the
  site has no secrets.
- No analytics, no tracking, no third-party requests of any kind. The page
  loads only its own static assets.
- No connection to FalkorDB, to the production graph, or to any analysis
  service. The findings, the graph and the activity record are the prepared
  sample dataset that ships with the prototype.
