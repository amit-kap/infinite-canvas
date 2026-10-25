---
name: Infinite canvas
status: develop
track: personal
platform: web
interest: See a whole app at once while building it — every screen live, side by side, and sendable to an agent
next: Publish infinitecanvas, then run it against one of my real projects — does the proxy + crawler hold up outside the two test apps?
updated: 2026-10-25
---
# Infinite canvas

> A dev-mode canvas that lays every screen of an app side by side — live, on mock data — so you can see the whole UX at once, rearrange it, and send screens to an agent for comments.

## About

Past a handful of screens, understanding an app becomes archaeology: you click through it, hold the flow in your head, and lose the whole. Designers solved this in Figma — every frame on one canvas. Developers have no equivalent for the real, running app.

Infinite canvas is a visual layer over a running app. Each route renders as a live, interactive frame on a 2D canvas, fed by the app's own mock data: tabs, filters, drawers and forms all work. Pan out to see the whole product, zoom in and use a screen for real, drag frames to match how you think about the app. Select screens and send them to an agent; its UX comments come back pinned to the frames.

It's built for agent-assisted development: the agent sees the same map you do, and its comments are attached to the screen they're about instead of living in a chat log.

## Product

- **Route manifest → map.** The app declares its screens; the canvas renders one live frame per route. No screenshots, no stale Figma.
- **Live frames.** Each frame is the real app in an iframe with deterministic mock data, so the same screen looks the same for you and for the agent.
- **Figma-style canvas.** Pan, zoom, drag frames by their label, marquee select, snap to grid, positions persist.
- **Send to agent.** Select screens → the agent reviews those routes → comments land on the frames with badges and a drawer.
- **A two-way channel.** The app reports route changes to the canvas, so a frame that navigates stays labelled correctly.

## v1 prototype

Built 2026-10-25: a demo app (security product, 12 routes, 4 drawer screens) plus the canvas tool — live frames, drag/snap/persist, zoom, minimap, route picker, send-to-agent with pinned comments. The agent call is simulated behind one function; the app↔canvas message channel is real.

Run it: `npm start`, open `http://localhost:4173`.

What it proved: the map reads immediately at 20% zoom, and live frames are worth the iframe cost — clicking through a screen inside a frame is the thing a screenshot can't do. What it didn't: whether the agent seam produces good comments when it's a real agent, or whether 12 screens is already too many to arrange by hand.

## v2 — it's a CLI now

The question "how do I move this between projects?" changed the architecture. It is no longer a folder you copy: `bin/canvas.js` proxies a running dev server, so the app keeps `/` and the tool lives at `/__canvas/` — one origin for free, which is the constraint that made setup heavy. The app needs no changes: the server injects the route/state channel into each HTML response. Screens come from `canvas.config.mjs`, or from a crawler that walks the app in a hidden iframe (so client-side routers work) and names each screen from its nav label or its own heading. Layout and comments moved out of `localStorage` into `.canvas/` in the repo — which is also the agent's future transport. `PLAN.md` has the design and what's left; `CHANGELOG.md` has the detail.

Run it: `npx canvas --app http://localhost:3000` (or `npm start` for the demo), open `http://127.0.0.1:4173/__canvas/`.

## v3 — it's a package (0.2.0)

All seven phases of `PLAN.md` are built and verified. Three things closed the loop:

**The agent is real.** The canvas and the agent share `.canvas/review.json` — the canvas posts a request, anything that can write a file answers, the canvas merges the reply into the comment threads and acks it. `npx canvas-agent` is a deterministic stub that proves the protocol; a real agent replaces it without touching the canvas. No socket, no SDK.

**It runs on a second app.** `examples/ledger/` is an unrelated finance app — path routing, real `<a href>` links, two drawers, zero canvas-specific code. `npx canvas --app .` crawls 12 screens, renders every one, relabels a frame as you navigate inside it, and the agent round-trip works. That test found three real bugs (framing headers only stripped for HTML, relative asset URLs 404ing at nested routes, an added screen landing on top of a neighbour), which is what a second app is for.

**It installs.** `npm pack` → install in an empty directory → `npx canvas --demo` and `npx canvas --app <ledger>` both work from `node_modules`. The registry name is `infinitecanvas` (`canvas` is the Cairo bindings); the bin is `canvas`, so `npx canvas` works from a local install.

What the second app also showed: a crawler follows links, so a drawer behind a button stays invisible. `Add screen → Any screen` (route + state, saved in `layout.json`) covers it for now; "capture this state" — open the drawer in a frame, press a key — is the obvious next step.

## Open questions

- What should the agent receive: route + fixtures, a DOM snapshot, or a screenshot? Which produces useful comments? (v3: route, title and URL; the agent can fetch the rest.)
- Where do comments live — the tool, the repo, or the agent session? (v2: the repo, `.canvas/comments.json`; v3: same file, and the agent writes through the same mailbox.)
- One app per map, or several apps and environments on the same canvas?
- Does this replace storybook-style component browsing, or sit above it?
- How good is the crawl on a real framework app — is a config file the exception or the rule? (v3: good on two hand-written apps; a Vite/Next app is the next test.)

## Next action

Publish `infinitecanvas`, then run `npx canvas --app <my real dev server>` on a project that has never seen this repo — and see whether the crawler finds the right screens or a config file is needed.
