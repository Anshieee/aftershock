# Ops note — FalkorDB MCP incident 2026-10-18 (closed)

Status: **resolved at the process level; durable fix pending upstream.**

## What happened
`falkordb-mcp` tool calls (`list_graphs`) hung or dropped the connection intermittently while
OpenCode sessions stayed alive; application-level connectivity via the official npm client was
never affected (35 ms reads, full create/read/delete smoke clean).

## Root cause (evidence-based)
Stale/wedged connection pools inside long-lived `falkordb-mcp` child processes:
- ~30 ESTABLISHED sockets to the cloud `:55370` endpoint across 4 MCP server processes;
  several with `Recv-Q=21` (un-read server replies → wedged requests) and no keepalive timers
  on idle entries → middleboxes silently drop them; pool re-use hangs callers → OpenCode
  "connection dropped" WARNs; failure correlated with session age (60–75 min post-spawn).
- Ruled out: config/endpoint/env-name mismatch (MATCH proven in-memory), wrong binary/deps
  (embeds `falkordb` 0.10.4), cloud outage (app path fine), wrong-target connections
  (zero local docker connections).

## Resolution performed (2026-10-18 21:10 local, within narrow restart mandate)
SIGTERM to the 4 stale `falkordb-mcp` PIDs only (parent `opencode serve` 802275 untouched);
sockets 30→0; OpenCode unregistered the dead servers. Fresh servers spawn in NEW sessions;
existing sessions keep no falkordb tools afterward (by design).

## OpenCode housekeeping recommendations (pending upstream consideration)
1. Lazily kill+respawn MCP servers idle beyond a threshold; cap per-server connection fan-out.
2. On 2 consecutive MCP tool failures, health-check and auto-recycle the server process instead
   of leaving a session wedged.

## Durable binary-side fix (falkordb-mcp)
In the `falkordb` 0.10.4 wrapper: enable TCP keepalive on pooled connections; drain/retire
connections idle > N minutes or with unread backlog; fail fast with an explicit reconnect error
rather than hanging callers on degraded sockets.

## Post-restart state (21:10 local)
- Wedged pools eliminated (30 sockets → 0); 4 stale servers unregistered by OpenCode.
- **No falkordb MCP in ANY session spawned afterward** — including brand-new agent sessions
  (their tool catalogs inherit the outer OpenCode process registrations; no per-session respawn).
- Regaining MCP tool visibility requires an **OpenCode service-level restart/reconnect by the user**
  (safe now; config `~/.config/opencode/opencode.json` is unchanged and correct). Until then, all
  assistant-side FalkorDB verification uses the **application path** instead (`npm run check`,
  server-lib integration tests) — which is the same path the product itself uses.

## Impact on Aftershock
Scoped only to assistant-side MCP verification (PR review live checks). The app's own
server-side path is the production graph connection and was verified working before, during,
and after the incident. Post-restart, fresh MCP spawn requires a user-side OpenCode restart;
until then all assistant-side FalkorDB verification uses the application path (see above); the
post-restart read-only re-verification replaces the earlier delegation plan.
