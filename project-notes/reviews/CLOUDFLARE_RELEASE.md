# Independent Cloudflare release review

Date: 2026-11-11. Reviewer: architecture subagent. Scope: deployment diff in
Worker/configuration, production server/menu policy, source notices, static pages
and CSP. This is a focused source/build review, not an independent production
browser or authenticated-game test.

## Outcome

No remaining source-level release blocker found after the correction below.
Publishing the exact source tag and verifying the deployed headers/runtime remain
release steps owned by the orchestrator.

## Blocker found and resolved

**High: inline script permission preserved an alternate remote-code path.** The
proposed `script-src 'self' 'unsafe-inline'` would still permit event handlers or
JavaScript links in unsanitized server dialog/popup HTML (`src/overlays.ts:899`,
`seed-selection` body/footer paths). The new safe gamedata parser alone did not
close that path. This was confirmed by source inspection; no public server was
sent an attack payload.

The reviewer removed `unsafe-inline`, added `script-src-attr 'none'` and
`frame-src 'none'`, and moved the generated static-page controls from inline
script to `/site-controls.js`. The same Vite plugin emits that file for production
and serves it in development. JSON-LD stays inert inline data. Script hashes or
runtime `unsafe-eval` are not needed. `site/site.js` behavior is unchanged.

The static-page “Report a bug” link was also corrected from the invalid release
source-tree URL plus `/issues` to `https://github.com/vittis/orbrun/issues`.

## Checks and evidence

- Read `wrangler.jsonc`, Worker request routing/cache validation, shared proxy
  policy, production server/account filtering, custom-server menu guards,
  release source links and shipped Acorn license notice.
- Worker configuration requires only `ASSETS`; `/engine/` explicitly returns 404.
  Production server lookup ignores stored custom/offline entries. Proxy upstream
  hosts are checked before edge cache lookup; redirects are refused.
- Source links consistently name `cloudflare-online-v1`. The tag must be public
  and point to the deployed source before rollout; this reviewer did not create
  or independently verify the remote tag.
- `npx vitest run apps/orbrun/test/site.test.ts apps/orbrun/test/analytics.test.ts`:
  **18 passed**, including a new build-hook test checking emitted external
  controls, no executable inline page scripts, intact JSON-LD, issue links and
  the restrictive CSP. Existing analytics tests emit happy-dom messages saying
  external JavaScript loading is disabled; assertions pass, no beacon was loaded.
- `npm run typecheck`: **passed** after the CSP/page correction.
- `npm run build`: **passed**, emitted `site-controls.js` (10.49 kB) and all four
  generated About/document pages. Existing JSON import-attribute and >500 kB
  chunk warnings remain; neither was introduced by this correction.
- The orchestrator separately reported full-suite results, dry-run binding/size
  checks and anonymous CBRG rendering. Those results were not independently
  rerun by this reviewer and remain recorded in the deployment/session notes.

## Required rollout checks / limitations

1. Confirm source tag and release link resolve to the deployed revision.
2. Verify the actual Cloudflare HTML response contains the restrictive CSP;
   Vite preview does not enforce `_headers` and is insufficient evidence.
3. Verify `/about` loads `/site-controls.js` with JavaScript content type and
   working page navigation, and anonymous spectating still renders with CSP.
4. Keep the documented distinction between anonymous spectating and login,
   rc/save workflows, physical gamepads and the planned top-down rewrite.

CSP is containment for existing raw HTML sinks, not a claim that those sinks are
sanitized. A future change to permit inline scripts/frames or load third-party
scripts requires another trust-boundary review. Broad server/browser coverage
and per-tile art provenance remain documented follow-ups, not newly discovered
release-specific defects.
