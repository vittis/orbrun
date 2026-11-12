# Remaining work and known limitations

Refactor completion is tracked in [DUNGEON_REFACTOR.md](DUNGEON_REFACTOR.md). The following work remains useful after the simplification; none is implicitly claimed complete by a green unit suite.

- **Hardware and authenticated acceptance:** test disposable authorized accounts and named controllers/browsers for login, creation/resume, inventory, spells/targeting, map/travel, text prompts, save/exit/reconnect and rc/save continuity. Separate physical device checks from synthetic events and anonymous spectating.
- **Broader compatibility:** exercise stable/trunk across supported public servers and desktop/mobile browsers. Capture fixtures for changed generated gamedata; parser failures require reviewed extensions.
- **Packed-art provenance:** inventory exact redistributed room/orb tiles against their original licenses. Existing version/rectangle provenance does not establish per-tile CC0. Preserve font, DCSS and upstream notices.
- **Proxy abuse controls:** current deadlines, bytes and concurrency budgets are per isolate. Distributed rate budgets and DNS resolution pinning are not implemented; bundled host DNS/TLS remains trusted.
- **Optional engine coverage:** provision pinned engine artifacts in a suitable JSPI toolchain and run required-engine lanes separately. Online-only production does not imply engine acceptance.
- **Dependency maintenance:** assess current audit findings with exposure context; do not reuse historical advisory counts or perform force-upgrades without verification.
- **Performance/accessibility matrix:** measure on target handhelds, narrow touch devices and reduced-motion setups. Preserve finite presentation work, idle sleep and input-to-send behavior while profiling.

Do not introduce a renderer framework, GPU rewrite, new UI framework or protocol rewrite merely to address these follow-ups.
