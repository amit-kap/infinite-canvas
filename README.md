# Infinite canvas

Every screen of your app on one canvas — live, arranged like a map, sendable to an agent for UX comments. A dev tool, not a new UX pattern: the frames are your real app in iframes, on its own mock or seeded data.

```bash
npm i -D infinitecanvas
npx canvas --app http://localhost:3000    # proxy your running dev server
npx canvas --app ./public                 # or serve a folder of static files
npx canvas --demo                         # the bundled Kestrel demo
```

Then open `http://127.0.0.1:4173/__canvas/`. The canvas lives at `/__canvas/`, your app keeps `/`.

No dependencies, no build step. Node 18+.

The bin is called `canvas`, so `npx canvas` works once the package is installed. The registry name is `infinitecanvas` — `canvas` itself is taken by the Cairo bindings.

## Why a proxy

Frames are iframes, and `postMessage` needs one origin, so the tool proxies your dev server instead of asking you to change it:

- the app is served byte-for-byte as you wrote it, plus one injected `<script>` and a `<base href="/">`
- that script reports route and overlay changes to the canvas, and forwards ⌘-wheel so zoom works over a live screen
- nothing in your app imports the canvas

The base tag is there for path-routed apps that link assets relatively (`href="app.css"`): without it, a frame at `/accounts` asks for `/accounts/app.css`. Your own `<base>` is left alone.

If your app already posts `{source:'kestrel-app', type:'route', route, state}` to its parent, it keeps working: the canvas only acts when the route actually changed.

## You watch the fix land

The loop this exists for: you leave a comment, an agent edits the code, and the frame shows you the change — no refresh, no rebuild, no "trust me".

- **A folder being served** is watched (`fs.watch`, recursively). A stylesheet change is swapped into every frame in place, so scroll position, filters and an open drawer survive. Anything else reloads the document, and `location.reload()` keeps whatever route that frame had navigated to — the fix lands where you were looking, not back at the screen's start. Frames that took an update flash a green outline and an `updated` label.
- **A proxied dev server** already does this better: its HMR socket is proxied, so Vite/Next/webpack push the change into the iframe themselves.

Ignored: `node_modules`, `.git`, `.canvas`, build output. Writing `.canvas/layout.json` while you drag must not reload your app, and it doesn't.

## Screens

A screen is one manifest entry — a route, optionally plus one open overlay:

```js
{ key: 'cases', title: 'Cases', group: 'Respond' }
{ key: 'cases', state: 'new-case', title: 'New case', group: 'Respond' }
```

`canvas.config.mjs` at the project root declares them (everything is optional):

```js
export default {
  app: 'http://localhost:3000',
  title: 'Kestrel',
  router: 'path',        // 'query' if your app routes as /?r=cases
  screens: [
    { key: 'cases', title: 'Cases', group: 'Respond' },
    { key: 'cases', state: 'new-case', title: 'New case', group: 'Respond' },
  ],
};
```

With no `screens`, the canvas **crawls the app** for them: it walks your nav from `/` in a hidden iframe, two levels deep, and names each screen from its nav label or its own heading. That is what makes the first run zero-config. `--crawl` ignores the config and shows you what the crawler finds, which is the fastest way to see what you would have to add by hand.

### Modals and drawers

`state` names an overlay the app opens on load, and the canvas puts it in the frame's URL:

```
/cases?state=new-case
```

So a modal is not a special case in the tool: it is a frame whose URL fully describes what it shows. Reload it, screenshot it, or hand it to an agent and the drawer is still open. The app owns the registry (in the demo, `OVERLAYS` in `app/app.js`); the canvas only needs the name.

A crawler can only follow links, so a drawer that opens from a button is invisible to it. Two ways to get one on the canvas:

- **`Add screen` → Any screen**: type the route and the state (`/invoices`, `new-invoice`) and it becomes a frame. Added screens are saved in `layout.json`, so they come back on reload.
- **`screens` in the config**, if you want the list in the repo and shared with the team.

Screen ids are `cases` and `cases~new-case`, and comments key off the id rather than the route, so a list and the same list with a drawer open have separate threads. A frame's label follows the app: it shows the screen's own name while it sits on its own route, then whatever route it has navigated to.

## Controls

| | |
|---|---|
| Pan | two-finger scroll, space + drag, middle-drag, or arrow keys (⇧ = bigger step) |
| Zoom | ⌘/Ctrl + scroll (works over a screen too), pinch, double-click empty canvas, or the zoom control |
| Select | click a frame label, shift-click to add, drag on empty canvas to marquee |
| Move | drag a frame by its label, or by its body while zoomed out — lands on a 24px grid and snaps to a neighbour's edges and centres; hold ⌥ for free 1:1 movement; moves the whole selection |
| Enter a screen | click a frame while zoomed out, double-click its label, or click its block in the minimap |
| Search / jump | `Add screen` lists every screen; on-canvas ones fly you there |
| Comment | select a screen → `Comment` → type → `Add comment` (⌘↵), or resolve it from the drawer |
| Agent | select screens → `Send to agent` → comments appear on frames and in the drawer |
| Fit all | `0` or `Fit` · 100% = `1` · remove = `Backspace` · clear = `Esc` |

Below 50% zoom the frames are inert, so the canvas takes every gesture — including a press-and-drag that moves the frame and a plain click that flies into it. Above 50%, screens are live: tabs, filters, toggles, forms and row navigation all work. Zoom keeps working over a screen because the frame forwards ⌘-wheel to the canvas; a plain two-finger scroll over a screen scrolls that screen, and space + scroll pans the canvas from anywhere.

Motion is built for 1:1 feel: gestures write the camera immediately and the DOM once per animation frame, wheel pans glide to their target instead of jumping per notch, wheel notches accumulate onto a running zoom instead of restarting it, flights move the world point under the screen centre and interpolate zoom geometrically, and the dot grid is a composited layer rather than a repainted background.

## State lives in the project

```
.canvas/
  layout.json     # frames: screen, route, state, x, y (+ screens added by hand)
  comments.json   # threads keyed by screen id
  review.json     # the agent mailbox (see below)
```

Written through the local API on a 400ms debounce, read on boot. Commit `.canvas/` and your layout and comments travel with the repo, survive a port change, and reach a teammate — or an agent — without a browser in common.

## The agent

The canvas and the agent share one file, `.canvas/review.json`. No socket, no SDK, no shared memory:

1. You select screens and press `Send to agent`. The canvas `POST`s to `/__canvas/review` with the screens — `{ id, route, state, title, url }` — **and the comments you wrote on them**, unresolved only:
   ```json
   {
     "screens": [{ "id": "cases", "route": "cases", "title": "Cases" }],
     "comments": {
       "cases": [{ "text": "The breach should be the loudest thing in the row.", "author": "You" }]
     }
   }
   ```
   The server writes it as `status: "pending"` with a `requestedAt` stamp. Those comments are the brief: without them the agent is guessing what "look at this screen" means.
2. Anything that can read and write a file answers. It edits the code and writes a reply:
   ```json
   {
     "status": "done",
     "requestedAt": 1761400000000,
     "reply": { "comments": { "cases": [{ "text": "Breach is now red and bold in the SLA column." }] } }
   }
   ```
3. The edit shows up on its own — see "You watch the fix land" above. The canvas polls, merges the reply into the matching thread (keys are screen ids), and `POST`s `/__canvas/review/ack` so the request is marked `acked` rather than replayed.

`npx canvas-agent` is a stub that does exactly this, deterministically per screen id — enough to prove the protocol end to end. Point a real agent at the same file and the stub becomes unnecessary; `--agent-stub` (on by default for `--demo`) starts it inside the canvas process, `--no-stub` leaves the mailbox to someone else.

Everything downstream — badges, drawer, resolve, persistence — is the same code path as a comment you write yourself.

## Layout

```
bin/canvas.js      args, config discovery, start
bin/agent-stub.js  canvas-agent: answers review.json
lib/server.js      static + proxy + file watcher + /__canvas API
lib/config.js      config discovery and normalisation
lib/agent-stub.js  the stub's protocol implementation
public/            the tool: index.html, canvas.js, canvas.css, crawl.js, glue.js
app/               the demo app (--demo)
examples/ledger/   a second, unrelated app used to test that none of this is Kestrel-specific
canvas.config.mjs  the demo's manifest
```

`PLAN.md` is the design and what is left; `CHANGELOG.md` is what changed.

## Limits worth knowing

- The proxy sees your app's session, so it binds to `127.0.0.1` only. Dev tool, not a deployment.
- Crawling needs your app to be URL-addressable and reachable from `/`; it costs a few seconds the first time, then caches in `localStorage` per origin.
- The crawler follows links, so it finds routes but not overlays. Add those by hand (`Any screen`) or in the config.
- Comments are text on a screen, not on a coordinate inside it. A frame is the unit of feedback.
- Watching is for a folder. A proxied dev server is not watched — it has HMR, which is better. An app served over a URL with no HMR will not update in place.
- A CSS change is swapped in place; a script change reloads the frame. If a component keeps state in JS (an open wizard step, a half-typed form), a non-CSS edit resets it.
- One canvas, one person: there is no merge, no presence, no conflict resolution on `.canvas/`.
- The demo's app routes with a query string (`/?r=cases`), which is why its config sets `router: 'query'`. Most apps use paths, which is the default.
