# FalkorDB setup — aftershock

The backend graph database for this project (and anything else you "host" here) is a
**FalkorDB Cloud instance** — never a local one. Exactly one instance, shared by all apps:

| | |
|---|---|
| Instance ID | `instance-ky5pnxl21` |
| Region | `ap-south-1` (hosted on AWS) |
| Endpoint | `r-6jissuruar.instance-ky5pnxl21.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud:55370` |
| Protocol | Redis protocol (RESP), plaintext — this endpoint does **not** speak TLS |
| User / Password | `falkordb` / (stored in `.env` — `FALKORDB_PASSWORD`) |
| Cypher | OpenCypher subset via `GRAPH.QUERY` / `GRAPH.RO_QUERY` (auth first: `AUTH`) |

Credentials live in `.env` (git-ignored). Copy `.env.example` if it's ever lost.

## How things are wired

### 1. Assistant access — `falkordb-mcp` (MCP server)
Configured in `~/.config/opencode/opencode.json` (global), so every OpenCode session in any
directory gets the live graph tools automatically:
- URL env `FALKORDB_URL=falkor://...` pointing at the cloud instance
- `FALKORDB_MCP_ALLOW_WRITES=1` — exposes `query_write`/`profile`
- Binary: `~/.cargo/bin/falkordb-mcp`

The binary was **rebuilt from source against `falkordb` 0.10.4** (upstream falkordb-mcp 0.1.2
pins `falkordb` 0.8.6, which inherits redis-rs 1.x's 500 ms response timeout / 1 s connect
timeout — it broke on the cloud ingress and on any query slower than ½ s). If you ever
reinstall it, keep the 0.10.4 dependency.

### 2. Application access — official clients + `.env`
- **Node**: `falkordb` (npm) — see `scripts/check.mjs` for the canonical pattern
- **Python**: `falkordb` (PyPI)
- **Rust**: `falkordb` (crates.io) — use ≥ 0.10 so timeouts behave
- Read connection info from `.env`: `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USER`,
  `FALKORDB_PASSWORD`, or the ready-made `FALKORDB_URL` (`redis://` scheme)

### 3. Management (rare) — FalkorDB Cloud REST API
Base `https://api.omnistrate.cloud` — create/stop/backup instances (docs:
https://docs.falkordb.com/cloud/api-reference/introduction). Uses web sign-in session cookies
(`omnistrate_token`, 1 h). Instance data-plane work does NOT need this API.

Verify app connectivity any time with:

```bash
npm install && npm run check
```

## Conventions
- One graph per concern, prefixed by app (e.g. `social:*`, `kb:*`) — cheap, isolated.
- Ask `GRAPH.LIST` (`db.graph.lists()` in the Node client) before creating.
- Always parameterize Cypher (`$param` + query params), never string-concat values.
- Writes → `GRAPH.QUERY` (or `query_write`); reads → `GRAPH.RO_QUERY` (`roQuery`).
- After a graph is used, delete throwaway graphs (like smoke tests) instead of leaking names.
