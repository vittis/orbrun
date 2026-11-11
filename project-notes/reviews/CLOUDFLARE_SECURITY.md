# Cloudflare security implementation and independent review

Date: 2026-11-11 (America/Sao_Paulo). Security reviewer: independent security subagent. Scope: hosted gamedata/morgue proxy, WebTiles connection, session load buffering, and independent review of the architecture agent's non-executing gamedata parser. No invasive public-server testing, credentials, or deployment actions were performed by this reviewer.

## Implemented boundaries

- `apps/orbrun/gamedata-proxy.ts`: exact bundled official HTTPS host:port allowlist, rejecting arbitrary custom hosts and redirects. Fetches have a 15-second total deadline (headers and body), streamed size limits (scripts 1 MiB, images 8 MiB, morgues 2 MiB), 16 concurrent upstream requests, and 16 MiB aggregate temporary buffered bytes per process/isolate. The Vite cache is LRU bounded to 64 entries/32 MiB. Errors are explicit, sanitized and not cached; invalid local proxy routes return 404 instead of falling through to the app shell. Range forwarding validates ordered safe integers and bounded span. Shared policy applies to Worker and Vite adapters.
- `packages/webtiles/src/connection.ts`: validates parsed envelope and all batched messages before dispatch; malformed/null entries cannot crash dispatch or apply a partial batch. Caps frames at 16 MiB UTF-8/binary, batches at 8,192 messages, message names at 128 characters, outgoing messages at 1 MiB, connecting queues at 1,024 messages/2 MiB, and native socket buffered bytes at 2 MiB. Resource/protocol failures emit a diagnostic and close once (application codes 4000/4002), rejecting late callbacks. Reopening starts with an empty command queue. Large valid recorded-style maps and future message names remain supported.
- `apps/orbrun/src/session.ts`: while assets load, caps retained messages at 8,192 and an estimated 32 MiB (twice serialized character count plus 64 bytes/message). Count/size limits remain effective when progress resets the existing stall timer. Overflow aborts loading, diagnoses/emits an error, clears authoritative state and presentation, discards the queue, disposes old gamedata, and closes the connection; reconnection starts fresh. Other gamedata failures now use this same explicit stop/reset path, preventing new-version deltas from being rendered using old-version assets. Late failed or completed loads cannot publish or replay discarded messages.

## Independent parser review

Reviewed `packages/gamedata/src/parse.ts`, `enum-template.ts`, loader integration, and parser tests. Acorn parses syntax; remote functions are never executed. Narrow declaration evaluation operates on owned null-prototype data, rejecting prototype-bearing and computed access, arbitrary calls, loops, getters, imports, and dependency mutation. Recognized helper ASTs are compared to reviewed templates; local implementations provide flag and tile accessors. Source, syntax, object/array, and flag-work limits constrain parsing and lookup work. Current-trunk comma sequences recursively apply the same restricted declaration grammar; they do not introduce arbitrary expression execution.

A concrete review finding was fixed: arbitrary flag names could overwrite Array structure (for example numeric properties or `length`) and large flag tables could multiply per-cell work. The parser now permits uppercase symbolic flag names, with `mask` allowed only for exclusive groups, and caps ordinary flags/exclusive groups/group entries at 256/32/64. Regression tests cover structural names and amplification.

A suggested parity-test defect was withdrawn after source verification: generated files export both `FLOOR_MAX` and `TILE_FLOOR_MAX` aliases, so the existing comparisons were executing. The architecture agent nevertheless added finite-range and comparison-count assertions to make that coverage explicit. This disagreement was resolved using the fixture source, not by accepting the review assumption.

No remaining remote-code execution primitive was identified in the reviewed parser. This is a bounded engineering review, not a formal proof or comprehensive audit. Architecture agent reports successful parsing of all nine live CDI stable and trunk modules; that live-server check is their evidence, not independently repeated here.

## Verification performed by this reviewer

| Command / check | Result |
|---|---|
| `npx vitest run apps/orbrun/test/gamedata-proxy.test.ts` | 38/38 passed after proxy hardening; mock upstream only |
| `npx vitest run packages/webtiles/test apps/orbrun/test/session-gamedata.test.ts` | 67/67 passed before final session hardening |
| `npx vitest run packages/gamedata/test/parse.test.ts` | 23/23 passed at independent review; architecture subsequently strengthened compatibility coverage |
| `npx vitest run apps/orbrun/test/session-gamedata.test.ts packages/webtiles/test/connection.test.ts` | 33/33 passed after final session hardening: 8 session + 25 connection tests |
| `npx tsc -b --pretty false` | Exit 0 after final session hardening |
| `git diff --check -- apps/orbrun/src/session.ts apps/orbrun/test/session-gamedata.test.ts` | Exit 0 |

Session tests verify count and byte overflow, progress that continues during overflow, no late replay, fresh reconnect, previous-version disposal on failure, and replay of the checked-in CDI spectating sequence (>500 map cells). These establish queue/reducer behavior, not live authenticated gameplay or renderer correctness. Root owns the complete-suite/build/deployment verification and should record final integrated totals separately.

## Residual limits and release considerations

- The proxy trusts bundled official host DNS/TLS. It does not perform address-resolution pinning or provide a distributed rate limiter. Per-isolate limits are not a global Cloudflare abuse budget. Arbitrary custom servers and redirects intentionally fail closed; legitimate endpoint changes require a reviewed registry update.
- Validate Worker destinations before cache lookup, and drop query strings from cache keys, so stale cache entries/query variants cannot bypass or amplify policy. This integration was flagged to the root, which owns Worker changes; verify its final implementation before deployment.
- Session byte accounting estimates retained data; it is not a strict JavaScript heap cap. Large object graphs have additional runtime overhead. Individual frame limits, message count limits, and bounded queue retention complement it.
- Frame/envelope checks do not validate every nested field of every DCSS message. Unknown message names remain tolerated for compatibility. Trusted-server semantic/schema regressions still require regression fixtures and diagnostics.
- Parsing fails closed on unsupported helper algorithms or generated syntax. Verify every supported server/version; future upstream changes may need a reviewed parser extension. Optional status-icon failure remains diagnostic with existing fallback behavior.
- Login tokens remain origin-readable browser storage; removing remote execution substantially reduces this exposure but does not replace ordinary XSS/dependency defenses. No real-login verification was performed here.
- Dependency upgrades, license/asset provenance, source availability, Cloudflare deployment permissions and production smoke checks remain the root's integrated release responsibilities. This review does not certify physical-controller behavior or gameplay completeness.
