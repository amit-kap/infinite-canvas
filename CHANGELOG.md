# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 0.2.0

Turning the prototype into a CLI you install instead of a folder you copy. All seven phases
of `PLAN.md` are built and verified, including on a second, unrelated app and from an
installed tarball.

### Added

- `bin/canvas.js` — `npx canvas --app <url|dir>`, `--port`, `--demo`, `--crawl`, `--state`,
  `--config`, `--agent-stub` / `--no-stub`.
- Proxy mode: the tool serves itself at `/__canvas/` and proxies everything else to a
  running dev server, so the app and the canvas share an origin without the app being
  modified.
- Static mode: `--app ./app` serves a folder as the app (how the demo runs).
- `glue.js`, injected into proxied HTML: posts route/state to the parent and forwards
  ⌘-wheel, so an app needs no canvas-specific code.
- Manifest crawler (`public/crawl.js`): walks the app in a hidden iframe — a rendered page,
  so it works for client-side routers — breadth-first from `/`, capped at 40. Nav labels
  name nav screens, each page's own heading names the rest. Cached per origin; `⋯ → Rescan
  screens` clears it, `--crawl` forces it.
- `canvas.config.js|mjs|cjs` discovery: `app`, `title`, `router`, and `screens` for what a
  crawler cannot see (modals, drawers).
- `.canvas/layout.json` and `.canvas/comments.json`, read and written through
  `/__canvas/state`. Layout and comments now travel with the repo instead of the browser.
- **Agent transport**: `.canvas/review.json` as a mailbox. `POST /__canvas/review` writes a
  request, `GET` polls for a reply, `POST /__canvas/review/ack` retires it. `lib/agent-stub.js`
  answers deterministically per screen id; `bin/agent-stub.js` (`canvas-agent`) runs it
  standalone, `--agent-stub` runs it in-process.
- **`Add screen → Any screen`**: a route plus an optional state, added as a frame and saved in
  `layout.json`. This is how an overlay the crawler cannot see gets on the canvas.
- **Live edits**: the served folder is watched (`fs.watch`, recursive, debounced) and changes
  are pushed to the browser over `GET /__canvas/events` (SSE). Stylesheets are swapped into
  every frame in place, keeping scroll position, filters and open drawers; anything else
  reloads the document on the route that frame had navigated to. Updated frames flash a green
  outline and an `updated` label. `node_modules`, `.git`, `.canvas` and build output are
  ignored, so dragging a frame never reloads the app.
- **Comments travel with the request**: `POST /__canvas/review` now carries the unresolved
  threads for the selected screens, so the agent receives the instruction and not just the
  screen.
- **Duplicate (`⌘D`)**: forks a frame at the state it is in right now — its current route and
  state, straight from the live iframe. The copy gets `parent`, so the path you actually walked
  is drawn as a wire between frames; no flow is declared anywhere. The wires live in the world
  layer, so they pan, zoom and follow the frames when they move.
- **States as app tokens.** `state` is opaque to the tool: an overlay, an empty dataset, a
  failed request — whatever the app can reproduce from a URL. A frame remembers the state it
  was left in, and `Add screen → Any screen` covers the states nothing can click into.
- **Fit fits the selection** when there is one, everything otherwise.
- `examples/ledger/` — a second app (path routing, real `<a href>` links, two drawers, no
  canvas code) used to check that none of this is Kestrel-specific.
- Package metadata: `bin` (`canvas`, `canvas-agent`), `files`, `engines`, `check` script,
  `publishConfig`, keywords. Registry name `infinitecanvas`.

### Changed

- `canvas.js` fetches its manifest from `/__canvas/manifest` instead of reading
  `window.KESTREL_ROUTES`, and builds frame URLs from the manifest's `router` (path or
  query string) instead of a hardcoded `app/?r=`.
- Persistence writes through the local API with a debounce; `localStorage` remains as a
  fallback when the canvas is served statically.
- `npm start` runs the demo through the CLI; `node server.js` still works.
- The tool lives at `/__canvas/` and the app at `/`, so absolute asset paths in a real app
  keep working, and the demo is served the way a real app is.
- `sendToAgent()` now posts to the server and waits for a real reply, replacing the canned
  `AGENT_NOTES` table (removed).
- A new screen lands on the first free cell of the layout grid instead of near the viewport
  centre, so adding one never drops it on a neighbour.

### Fixed

- A frame that reloaded straight into an overlay kept its old label. The canvas handled
  `route` messages but not `ready`, and compared routes without their state; both now
  compare route *and* state.
- An app that refuses framing (`X-Frame-Options`, `frame-ancestors`) now renders: the proxy
  strips those headers for every response, not just HTML.
- An absolute `Location` from a dev server (`http://localhost:3000/new`) is rewritten to a
  relative one, so a redirect cannot walk a frame out of the proxy.
- WebSocket upgrades are proxied, so hot reload and HMR keep working inside a frame.
- Path-routed apps that link assets relatively (`href="app.css"`) 404'd at `/accounts/app.css`.
  Served HTML now carries `<base href="/">` unless the app ships its own.
- A frame that navigated to a parameterised route showed the raw id (`2288`) instead of a name;
  the label now borrows a sibling manifest entry (`/case/2291` → "Case detail").
- Frame labels are counter-scaled to stay readable at any zoom, which turned a 22-screen map
  into a lattice of overlapping chips at 9%. Below 30% they now ride the zoom instead.

## [0.1.0] — 2026-10-25

The prototype: a 16-screen demo app ("Kestrel") on a canvas that behaves like a map.

### Added

- Live frames — one iframe per screen, same-origin, real navigation inside each.
- Camera with a single source of truth: rAF-coalesced painting, gliding wheel pans,
  accumulating wheel zoom, geometric `flyTo`, composited dot grid. Measured 60fps
  (median 16.7ms, p90 16.8ms) through a 62%→192%→56% burst with 12 live iframes.
- Drag with a 24px grid snap, magnetic snap to a neighbour's edges and centres with
  alignment guides, ⌥ for free 1:1 movement, whole-selection moves.
- Below 50% zoom frames are inert: press-and-drag moves a frame, a click flies to it at
  100%. Above 50% the screens are live and forward ⌘-wheel to the canvas.
- Marquee select, shift-click, fit, 100%, minimap (click a block to open it at 100%),
  arrow-key panning, space-to-pan from anywhere, double-click to zoom.
- Screen manifest with overlays: an entry may carry `state`, so a modal is a frame whose
  URL is `?r=cases&state=new-case`. Screen ids are `key` or `key~state`, so a list and the
  same list with a drawer open have separate comment threads.
- Comments written by hand (composer, ⌘↵) or by the agent, with frame badges, a drawer,
  resolve, and per-screen threads.
- `sendToAgent()` seam: simulated, writing canned `AGENT_NOTES`; everything downstream is
  real.
- Zero-dependency static server, `localStorage` persistence, `⋯ → Reset layout`.

### Known limitations

- Launch is hardcoded to the bundled demo app.
- The agent is simulated.
- State is per browser and per port.
