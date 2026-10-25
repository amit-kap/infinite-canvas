# Plan

## The thing

Every screen of a running app, laid out live on one canvas. You pan and zoom like a map, the
screens are the real app, you drag them into the shape of the product, and you can hand a
selection to an agent for UX comments. A dev tool for looking at a whole app at once — not a
new way to build one.

What it is not: a prototyping tool, a screenshot gallery, or a design surface. The screens
are live so that a filter, a drawer, or a hover state is one gesture away.

## Decisions

**One origin, by proxy.** Frames are iframes and `postMessage` needs a shared origin. Rather
than ask the app to add a script, `canvas` proxies the dev server: the app keeps `/`, the tool
takes `/__canvas/`. The proxy injects one `<script>` and a `<base href="/">`, strips
`X-Frame-Options`/CSP (a canvas *is* a frame host), rewrites absolute `Location` headers, and
forwards WebSocket upgrades so hot reload still works inside a frame.

**Screens are data, not code.** A screen is `{ key, state?, title, group }`. Ids are
`key` or `key~state`, so a list and the same list with a drawer open are different screens
with different comment threads. A frame's URL fully describes what it shows, which is what
makes an overlay reloadable, screenshotable and sendable.

**Config if you have one, a crawl if you don't.** `canvas.config.mjs` is exact but needs
writing. With no config the tool crawls the app in a hidden iframe — a rendered page, so
client-side routers work — and names screens from nav labels and headings. Zero-config first
run is the difference between "install it" and "set it up".

**State in the project, not the browser.** `.canvas/layout.json` and `.canvas/comments.json`
are read and written through the local API, with `localStorage` as a fallback. Commit them:
the layout and the comments then belong to the repo, not to one browser on one port.

**The agent is a mailbox.** `.canvas/review.json`: the canvas writes a request — the screens
*and the comments you wrote on them* — an agent edits the code and writes a reply, the canvas
polls, merges, acks. No SDK, no socket, no server. Any process that can write a file can be the
agent.

**You watch the fix, not a description of it.** A folder being served is watched; a change is
pushed to the browser over SSE and lands in the frames — stylesheets swapped in place so state
survives, everything else reloaded onto the route that frame was already on. A proxied dev
server needs none of this: its HMR socket is proxied and does it better.

**A package, not a folder.** `npx canvas`. One command, no copy-paste, no build step, no
dependencies.

## Phases

| # | Phase | State |
|---|---|---|
| 0 | Prototype: 16 live frames, map-grade camera, drag/snap, marquee, minimap, comments | done |
| 1 | CLI: `bin/canvas.js`, `--app`, `--port`, `--demo`, config discovery | done |
| 2 | Proxy: glue injection, framing headers, `Location`, WebSocket upgrades | done |
| 3 | Screens: config manifest + browser-side crawler, `router: 'path' \| 'query'` | done |
| 4 | File state: `/__canvas/state`, `.canvas/*.json`, localStorage fallback | done |
| 5 | Agent transport: `/__canvas/review`, `lib/agent-stub.js`, `canvas-agent` bin | done |
| 6 | Package: bins, `files`, `engines`, `check`, publish metadata | done |
| 7 | Validate on a second, unrelated app | done |
| 8 | Close the loop: comments travel to the agent, edits land live on the frames | done |

## Verification

Checked in a real browser on 2026-10-25. Phases 1–4 on the demo; 5–7 on both apps and on an
installed copy of the tarball.

| Check | Result |
|---|---|
| `npm start` (demo, config mode) | 16 frames at 23%, 4 drawers open, brand and title from the manifest, no console errors |
| Frame URLs | `/?r=overview`, `/?r=cases&state=new-case` — no `app/` prefix |
| Glue injection | `<script src="/__canvas/glue.js">` in the served HTML; `__canvasGlue` true inside a frame |
| Duplicate channels | the demo's own `post()` plus the injected glue coexist; closing a drawer relabels `New case → Cases`, clicking a case row relabels `Cases → Case detail` |
| File state | `.canvas/layout.json` and `.canvas/comments.json` written on first boot and on a comment; `GET /__canvas/state` round-trips |
| Proxy mode | app on `:3000`, canvas on `:4175` → 16 frames, 4 drawers, stylesheet loaded, no console errors |
| Hostile app (`/tmp/hostile-app.js`) | `X-Frame-Options: DENY` + `frame-ancestors 'none'` stripped, frame renders; `Location: http://localhost:3100/new` → `/new`; WebSocket 101 through the proxy, `hello` arrives inside the iframe (`ws=open`, `msg=hello`) |
| Crawl, config-free project | `--app <dir>` from `/tmp` with no config: manifest `source: "crawl"`, router defaults to `path` |
| Crawl quality (demo) | 26 screens: 8 nav routes by nav label, detail screens by their own heading (`Impossible travel — Dana Levi`) |
| Crawl cost | ~15s for 26 screens cold; instant on reload from the `localStorage` cache |
| `--crawl` | overrides config screens and reports `screens 0` so the client crawls |
| Agent round-trip (demo) | sent `New case` → 3 comments in its thread, toast `Agent left 3 comments on 1 screen`, `review.json` ends `status: acked` |
| **Second app** (`examples/ledger`, path routing, zero canvas code) | 12 screens crawled, every frame renders its own page, labels from each page's `<h1>` (`Cash`, `Accounts receivable`), no console errors |
| Second app: live navigation | clicking a nav link inside a frame relabels that frame `Overview /` → `Invoices /invoices` |
| Second app: overlays | crawler cannot see them (no link); `Add screen → /invoices + new-invoice` puts the drawer on the canvas, renders `New invoice`, and survives a reload (saved in `layout.json`) |
| Second app: multi-select + agent | 3 screens → 6 comments across 3 threads, `review.json` `acked`, threads in `comments.json` |
| Base tag | `/accounts` served with `<base href="/">`; relative `app.css` resolves, no 404s |
| Installed package | `npm pack` → install in a temp dir → `npx canvas --demo` (16 screens, glue present) and `npx canvas --app <ledger>` (12 screens crawled in the browser) |
| `canvas-agent` standalone | `npx canvas-agent --state .canvas-agent` answers a hand-written `pending` request: `status: done`, two comments |
| **Brief reaches the agent** | a comment written on `Cases` arrives in `review.json` as `comments.cases[0].text` — the agent gets the instruction, not just the screen |
| **Fix lands live** | with the canvas open and untouched: editing `app/app.css` recoloured all 16 frames in place (no reload, `--accent` read back from inside each iframe); editing `app/data.js` updated the Cases table through a document reload |
| **Route survives the reload** | a frame navigated to `/case/2288` stayed on `/case/2288` after a script edit reloaded it |
| **Update feedback** | a MutationObserver over the frames recorded `is-updated` on all 16 for a single stylesheet change, cleared after 1.5s |
| **No reload loop** | writing `.canvas/layout.json` fires no event; `node_modules/junk/a.js` fires none; `src/deep.js` fires one |
| Syntax | `npm run check` clean on all eleven files |

## Known limits

- **A fix resets JS state.** The frame reloads its document, so an open wizard step or a
  half-typed form is gone. That is what `location.reload()` means everywhere, but with 16 live
  frames it is more visible than in a single tab. Stylesheet edits are the exception: they are
  swapped in place and keep everything.
- **Watching is local and folder-only.** A proxied dev server relies on its own HMR; an app
  served from a URL with no HMR will not update in place.
- **Overlay discovery is manual.** The crawler follows links; a drawer behind a button is
  invisible. `Add screen → Any screen` and the `screens` config both cover it, but a
  one-click "capture this state" (open the drawer in a frame, then "add as screen") is the
  obvious next step and is not built.
- **Crawl cost.** ~15s cold on a 26-screen app, cached after. It runs in the browser, so it
  competes with the app it is crawling.
- **Comments are per screen, not per coordinate.** Good enough for "this screen is confusing",
  not for "this button, here". Pixel-anchored comments need a coordinate plus a way to keep it
  stable across layout changes.
- **One person.** No presence, no merge, no locking on `.canvas/`. Two canvases open on the
  same folder will overwrite each other's `layout.json`.
- **Iframe fidelity.** A screen is 1280×800. A responsive app is only verified at that width;
  the frame size is not configurable yet.
- **Publishing.** The package name is `infinitecanvas` (both `canvas` and `infinite-canvas`
  are taken). The bin is `canvas`, so `npx canvas` works from a local install. Not published.

## Next

1. "Capture state": open a drawer inside a frame, press a key, get a screen — removes the last
   manual step for modals.
2. Keep JS state across a reload: re-open the drawer / re-apply the filters the frame had,
   so an agent's script edit doesn't cost you your place.
3. Frame size in the config (`1280×800` default), so a mobile app is possible.
4. Coordinates on comments: a pin at a point inside the frame, stored as a fraction of the
   frame, drawn over the screen.
5. Publish `infinitecanvas` to npm, then test `npx canvas --app <a real Vite app>` on a machine
   that has never seen this repo.
