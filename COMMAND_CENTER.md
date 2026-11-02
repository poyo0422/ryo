# RETAINER / Phase 1 preview

Open `command.html` through the same static HTTP server as `index.html`. No installation or build is required. The original journal and MT5 sync remain at `index.html` and are unchanged by this preview.

- `command.html`: accessible page structure, provisional inline SVG avatar, dialog and chat UI.
- `command.css`: neon/glass styling, responsive layout, CSS 3D carousel, reduced-motion support.
- `command.js`: seven-module carousel (pointer/keyboard/buttons), local Japanese guide, modal information, Japan-time clock, read-only local-history summary.

The avatar is explicitly provisional: the supplied design brief referred to a character reference image, but no reference image was attached. Replace only after the reference is available. No live quotes, balances, EA heartbeat, news, external AI, order execution or LINE integration are implemented here. Decorative waveforms are labelled as visuals, not market data. The guide uses deterministic local responses, not an AI API. No connection tokens are read by this page. Trade data is read from the existing localStorage key; never overwrite it from this UI.

The header reports cached MT5 trade counts, not live connectivity. Currency summaries stay separate; there is no FX conversion. Opening the original trade screen is necessary for authenticated synchronization. All existing server/EA instructions remain in `mt5/SETUP.md`.

Validated in Chromium: seven menu modules, modal close/Escape, keyboard navigation, pointer drag, JPY/USD summaries, chat escaping, JST clock, unchanged local trade storage, 390px mobile layout. Existing trade CRUD, CSV and mocked MT5 sync regression checks passed. Current Node checks: `node --check command.js` and `node --test server/worker.test.mjs`.

Next integration stages require an expanded read-only EA snapshot (balance, equity, position and bid/ask timestamps) plus authenticated storage routes, redeployment by the Cloudflare account holder, and MetaEditor/demo-terminal testing. Real AI needs a server-side provider credential and explicit data/source/freshness handling. Do not imply that the Phase 1 UI already has these services connected.
