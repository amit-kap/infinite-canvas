(function () {
  'use strict';

  // Screens come from the server's manifest (config, or a crawl of the app) —
  // see boot() at the bottom.
  let ROUTES = [];
  // Screens added by hand (a drawer the crawler cannot see). They live in
  // layout.json next to the frames, so they survive a reload.
  let ADDED = [];
  let ROUTER = 'path';
  let APP_TITLE = '';
  const FW = 1280;
  const FH = 800;
  const SNAP = 24;
  // Gaps are chosen so the layout pitch stays a multiple of SNAP: a frame
  // dropped on the grid can then line up exactly with an untouched neighbour.
  const GX = 184;
  const GY = 184;
  const COLS = 4;
  const MINZ = 0.06;
  const MAXZ = 2;
  const STORE = 'kestrel.canvas.v1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const stage = document.getElementById('stage');
  const brandName = document.getElementById('brandName');
  const brandMark = document.getElementById('brandMark');
  const grid = document.getElementById('grid');
  const world = document.getElementById('world');
  const framesEl = document.getElementById('frames');
  const zoomLabel = document.getElementById('zoomLabel');
  const selbar = document.getElementById('selbar');
  const selCount = document.getElementById('selCount');
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawerBody');
  const drawerCount = document.getElementById('drawerCount');
  const commentsCount = document.getElementById('commentsCount');
  const picker = document.getElementById('picker');
  const menuEl = document.getElementById('menu');
  const mmFrames = document.getElementById('mmFrames');
  const mmView = document.getElementById('mmView');
  const minimap = document.getElementById('minimap');
  const zoomCtl = document.getElementById('zoom');
  const composer = document.getElementById('composer');
  const composerText = document.getElementById('composerText');
  const composerTitle = document.getElementById('composerTitle');
  const commentBtn = document.getElementById('commentBtn');

  const guideV = document.createElement('div');
  guideV.className = 'guide guide--v';
  const guideH = document.createElement('div');
  guideH.className = 'guide guide--h';
  document.getElementById('guides').appendChild(guideV, guideH);
  const marquee = document.getElementById('marquee');
  const toastEl = document.getElementById('toast');
  const addBtn = document.getElementById('addBtn');
  const commentsBtn = document.getElementById('commentsBtn');
  const menuBtn = document.getElementById('menuBtn');
  const emptyEl = document.getElementById('empty');
  const emptyAdd = document.getElementById('emptyAdd');

  const cam = { x: 0, y: 0, z: 0.24 };
  let frames = [];
  let comments = {};
  const selected = new Set();
  let uid = 1;
  let spaceDown = false;
  let sending = false;

  // ---------------------------------------------------------------- utils

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function titleFromRoute(route) {
    if (!route) return 'Home';
    const last = route.split('/').filter(Boolean).pop() || '';
    return last.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) || route;
  }

  function metaFor(route) {
    const hit = ROUTES.find((r) => r.key === route);
    if (hit) return hit;
    // A screen id that is no longer in the manifest (`cases~new-case`): show the
    // route it belongs to rather than the raw id.
    const bare = String(route || '').split('~')[0];

    // A parameterised detail route (/case/2288) has no entry of its own, and
    // "2288" is not a name. Borrow the label of a sibling the manifest does
    // know (/case/2291 → "Case detail"), so a frame you clicked into still
    // reads like a screen.
    const slash = bare.indexOf('/');
    if (slash > 0) {
      const prefix = bare.slice(0, slash + 1);
      const sibling = ROUTES.find((r) => r.key.startsWith(prefix) && r.key.length > prefix.length);
      if (sibling) return { ...sibling, key: bare };
    }

    return { key: bare, title: titleFromRoute(bare), group: '' };
  }

  // A screen is a manifest entry: a route, optionally plus one open overlay.
  // Its id is what comments and the canvas key off, so `cases` and `cases` with
  // the new-case drawer are two different screens with two separate threads.
  function screenId(entry) {
    return entry.state ? entry.key + '~' + entry.state : entry.key;
  }

  function screenMeta(id) {
    const hit = ROUTES.find((r) => screenId(r) === id);
    if (hit) return hit;
    const meta = metaFor(id);
    return { key: id, title: meta.title, group: '', state: '' };
  }

  // The label a frame shows: the screen's own name while it is on its own
  // route, otherwise the route it has navigated to.
  function frameTitle(frame) {
    return frame.state ? screenMeta(frame.screen).title : metaFor(frame.route).title;
  }

  function routeLabel(route, state) {
    return '/' + route + (state ? ' · ' + state : '');
  }

  // The URL a frame loads. `router` is the only thing the tool needs to know
  // about how an app addresses its screens: query string (this demo) or path.
  function frameSrc(route, state) {
    const r = String(route || '');
    if (ROUTER === 'query') {
      return '/?r=' + encodeURIComponent(r) + (state ? '&state=' + encodeURIComponent(state) : '');
    }
    return '/' + r.replace(/^\/+/, '') + (state ? '?state=' + encodeURIComponent(state) : '');
  }

  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2400);
  }

  function timeAgo(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    return Math.floor(mins / 60) + 'h ago';
  }

  // ---------------------------------------------------------------- camera

  // The camera is the single source of truth. Gestures mutate it immediately
  // (zero input latency) but the DOM is written once per animation frame, so a
  // burst of wheel or pointer events costs one style flush, not one per event.
  let viewW = 0;
  let viewH = 0;
  let stageLeft = 0;
  let stageTop = 0;
  let paintQueued = false;
  let paintedZ = -1;
  let liveTimer = 0;

  function measure() {
    viewW = stage.clientWidth;
    viewH = stage.clientHeight;
    const r = stage.getBoundingClientRect();
    stageLeft = r.left;
    stageTop = r.top;
  }

  // Keep the world composited for the length of a gesture so zooming scales the
  // existing raster instead of re-rasterising twelve iframes every event.
  function markLive() {
    world.classList.add('is-live');
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (!anim && !glide) world.classList.remove('is-live');
    }, 260);
  }

  function applyCam() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(paint);
  }

  function paint() {
    paintQueued = false;
    world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.z})`;
    if (cam.z !== paintedZ) {
      paintedZ = cam.z;
      world.style.setProperty('--inv', String(1 / cam.z));
      world.classList.toggle('is-far', cam.z < 0.5);
      zoomLabel.textContent = Math.round(cam.z * 100) + '%';
    }
    // The dot grid repeats every 28px, so the modulo keeps it in phase while
    // moving on the compositor instead of repainting the stage background.
    grid.style.transform = `translate3d(${cam.x % 28}px, ${cam.y % 28}px, 0)`;
    updateMinimapView();
  }

  function stopAnim() {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
    stopGlide();
    zoomGoal = 0;
  }

  // Wheel pans glide to their target with exponential easing instead of
  // jumping per notch; a trackpad's continuous deltas bypass this entirely.
  let glide = 0;
  let glideTarget = null;

  function stopGlide() {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
    glideTarget = null;
  }

  function glideTo(tx, ty) {
    glideTarget = { x: tx, y: ty };
    if (glide) return;
    markLive();
    function step() {
      const t = glideTarget;
      cam.x += (t.x - cam.x) * 0.32;
      cam.y += (t.y - cam.y) * 0.32;
      const done = Math.abs(t.x - cam.x) < 0.4 && Math.abs(t.y - cam.y) < 0.4;
      if (done) {
        cam.x = t.x;
        cam.y = t.y;
        glide = 0;
        glideTarget = null;
        markLive();
      }
      applyCam();
      if (!done) glide = requestAnimationFrame(step);
    }
    glide = requestAnimationFrame(step);
  }

  let anim = 0;
  // While a wheel-zoom animation is running, further notches accumulate onto
  // its target instead of restarting from the current (half-way) zoom.
  let zoomGoal = 0;
  function flyTo(target, instant, dur) {
    stopAnim();
    if (instant || reduced) {
      cam.x = target.x;
      cam.y = target.y;
      cam.z = target.z;
      applyCam();
      return;
    }
    const from = { x: cam.x, y: cam.y, z: cam.z };
    const start = performance.now();
    const d = dur || 300;
    // Fly by moving the world point under the screen centre and zooming
    // geometrically, rather than interpolating x/y/z linearly — a 20%→100%
    // flight otherwise spends most of its time arriving.
    const cx = viewW / 2;
    const cy = viewH / 2;
    const ax = (cx - from.x) / from.z;
    const ay = (cy - from.y) / from.z;
    const bx = (cx - target.x) / target.z;
    const by = (cy - target.y) / target.z;
    const rz = target.z / from.z;
    markLive();
    function step(now) {
      const t = Math.min(1, (now - start) / d);
      const e = 1 - Math.pow(1 - t, 3);
      cam.z = from.z * Math.pow(rz, e);
      cam.x = cx - (ax + (bx - ax) * e) * cam.z;
      cam.y = cy - (ay + (by - ay) * e) * cam.z;
      applyCam();
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        cam.x = target.x;
        cam.y = target.y;
        cam.z = target.z;
        applyCam();
        anim = 0;
        markLive();
      }
    }
    anim = requestAnimationFrame(step);
  }

  // Zoom that keeps one world point pinned under the cursor. z interpolates
  // geometrically and x/y are derived from the anchor, so the point never drifts.
  function zoomAnim(sx, sy, targetZ, dur) {
    stopAnim();
    const z0 = cam.z;
    const nz = clamp(targetZ, MINZ, MAXZ);
    if (Math.abs(nz - z0) < 0.0005) return;
    const wx = (sx - cam.x) / z0;
    const wy = (sy - cam.y) / z0;
    zoomGoal = nz;
    if (reduced) {
      cam.z = nz;
      cam.x = sx - wx * nz;
      cam.y = sy - wy * nz;
      applyCam();
      return;
    }
    const start = performance.now();
    markLive();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      cam.z = z0 * Math.pow(nz / z0, e);
      cam.x = sx - wx * cam.z;
      cam.y = sy - wy * cam.z;
      applyCam();
      if (t < 1) anim = requestAnimationFrame(step);
      else {
        anim = 0;
        zoomGoal = 0;
        markLive();
      }
    }
    anim = requestAnimationFrame(step);
  }

  function zoomAt(sx, sy, factor) {
    stopAnim();
    const nz = clamp(cam.z * factor, MINZ, MAXZ);
    if (nz === cam.z) return;
    const k = nz / cam.z;
    cam.x = sx - (sx - cam.x) * k;
    cam.y = sy - (sy - cam.y) * k;
    cam.z = nz;
    markLive();
    applyCam();
  }

  function zoomToCenter(z) {
    zoomAnim(viewW / 2, viewH / 2, z, 190);
  }

  // Zoom steps accumulate on the pending target, so holding + or rolling the
  // wheel does not restart the easing from a half-finished zoom.
  function zoomStep(factor) {
    const base = zoomGoal || cam.z;
    zoomAnim(viewW / 2, viewH / 2, clamp(base * factor, MINZ, MAXZ), 160);
  }

  function bounds() {
    if (!frames.length) return { x: 0, y: 0, w: FW, h: FH };
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    frames.forEach((f) => {
      x1 = Math.min(x1, f.x);
      y1 = Math.min(y1, f.y);
      x2 = Math.max(x2, f.x + FW);
      y2 = Math.max(y2, f.y + FH);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function fit(instant) {
    const b = bounds();
    const pad = 56;
    const labelSpace = 44;
    const z = clamp(Math.min((viewW - pad * 2) / b.w, (viewH - pad * 2) / (b.h + labelSpace)), MINZ, 1);
    flyTo(
      {
        x: (viewW - b.w * z) / 2 - b.x * z,
        y: (viewH - (b.h + labelSpace) * z) / 2 - (b.y - labelSpace) * z,
        z,
      },
      instant,
      320
    );
  }

  function focusFrame(frame, instant, full) {
    const vw = viewW;
    const vh = viewH;
    const dw = drawer.hidden ? 0 : 320;
    const z = full ? 1 : clamp(Math.min((vw - 120) / FW, (vh - 120) / FH), MINZ, 1);
    // Centre in the space the drawer leaves, but never push the screen's left
    // edge off-screen — at 100% it can be wider than that space.
    const x = Math.max((vw - dw - FW * z) / 2, 8) - frame.x * z;
    flyTo(
      {
        x,
        y: (vh - FH * z) / 2 - frame.y * z,
        z,
      },
      instant,
      300
    );
  }

  // ---------------------------------------------------------------- frames

  function addFrame(sid, x, y, id, routeOverride, stateOverride) {
    const meta = screenMeta(sid);
    const route = routeOverride || meta.key;
    const state = typeof stateOverride === 'string' ? stateOverride : meta.state || '';
    const frame = { id: id || 'f' + uid++, screen: sid, route, state, x, y };
    const src = frameSrc(route, state);

    const el = document.createElement('div');
    el.className = 'frame';
    el.dataset.id = frame.id;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.innerHTML =
      `<div class="frame__label" role="button" tabindex="-1" aria-label="${esc(meta.title)}">` +
      `<span class="frame__check"></span>` +
      `<span class="frame__title">${esc(meta.title)}</span>` +
      `<span class="frame__route">${esc(routeLabel(route, state))}</span>` +
      `<span class="frame__badge" hidden></span>` +
      `</div>` +
      `<div class="frame__screen"><iframe src="${esc(src)}" title="${esc(meta.title)}"></iframe></div>`;

    frame.el = el;
    frame.label = el.querySelector('.frame__label');
    frame.titleEl = el.querySelector('.frame__title');
    frame.routeEl = el.querySelector('.frame__route');
    frame.badgeEl = el.querySelector('.frame__badge');
    frame.iframe = el.querySelector('iframe');

    framesEl.appendChild(el);
    frames.push(frame);
    refreshBadge(frame);
    updateEmpty();
    return frame;
  }

  function updateEmpty() {
    const none = frames.length === 0;
    emptyEl.hidden = !none;
    minimap.hidden = frames.length < 2;
    zoomCtl.hidden = none;
    if (none) {
      zoomLabel.textContent = '—';
    }
    // Force the next paint to rewrite the zoom label even if z did not move.
    paintedZ = -1;
    applyCam();
  }

  function refreshBadge(frame) {
    const n = (comments[frame.screen] || []).filter((c) => !c.resolved).length;
    frame.badgeEl.hidden = n === 0;
    frame.badgeEl.textContent = String(n);
  }

  function updateFrameMeta(frame) {
    const title = frameTitle(frame);
    frame.titleEl.textContent = title;
    frame.routeEl.textContent = routeLabel(frame.route, frame.state);
    frame.iframe.title = title;
    frame.label.setAttribute('aria-label', title);
    refreshBadge(frame);
    renderDrawer();
  }

  function layoutAll() {
    ROUTES.forEach((entry, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      addFrame(screenId(entry), col * (FW + GX), row * (FH + GY));
    });
  }

  // A new screen takes the first free cell of the layout grid, so adding one
  // never drops it on top of a neighbour.
  function freeSlot() {
    const pitchX = FW + GX;
    const pitchY = FH + GY;
    const taken = new Set(
      frames.map((f) => Math.round(f.x / pitchX) + ':' + Math.round(f.y / pitchY))
    );
    for (let i = 0; i < 400; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      if (!taken.has(col + ':' + row)) return [col * pitchX, row * pitchY];
    }
    return [0, 0];
  }

  function removeSelected() {
    if (!selected.size) return;
    frames = frames.filter((f) => {
      if (selected.has(f.id)) {
        f.el.remove();
        return false;
      }
      return true;
    });
    selected.clear();
    syncSelection();
    buildMinimap();
    renderDrawer();
    updateEmpty();
    save();
  }

  function resetLayout() {
    frames.forEach((f) => f.el.remove());
    frames = [];
    selected.clear();
    layoutAll();
    syncSelection();
    buildMinimap();
    renderDrawer();
    save();
    fit();
    toast('Layout reset');
  }

  // ---------------------------------------------------------------- selection

  function select(id) {
    selected.add(id);
    syncSelection();
  }

  function toggleSelect(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    syncSelection();
  }

  function clearSelection() {
    if (!selected.size) return;
    selected.clear();
    syncSelection();
  }

  function syncSelection() {
    frames.forEach((f) => f.el.classList.toggle('is-selected', selected.has(f.id)));
    const n = selected.size;
    selbar.hidden = n === 0;
    if (n === 0) composer.hidden = true;
    selCount.textContent = n + (n === 1 ? ' screen' : ' screens');
    layoutMinimap();
  }

  // ---------------------------------------------------------------- minimap

  let mmScale = 1;
  let mmOrigin = { x: 0, y: 0 };
  let mmW = 190;
  let mmH = 90;

  function buildMinimap() {
    const b = bounds();
    mmW = 190;
    mmH = Math.max(52, Math.round((mmW * b.h) / b.w));
    mmFrames.style.width = mmW + 'px';
    mmFrames.style.height = mmH + 'px';
    mmScale = mmW / b.w;
    mmOrigin = { x: b.x, y: b.y };

    mmFrames.querySelectorAll('.mm').forEach((n) => n.remove());
    frames.forEach((f) => {
      const d = document.createElement('div');
      d.className = 'mm';
      d.dataset.id = f.id;
      d.title = frameTitle(f) + ' — click to open at 100%';
      mmFrames.appendChild(d);
      f.mm = d;
    });
    layoutMinimap();
  }

  function layoutMinimap() {
    frames.forEach((f) => {
      if (!f.mm) return;
      f.mm.style.left = (f.x - mmOrigin.x) * mmScale + 'px';
      f.mm.style.top = (f.y - mmOrigin.y) * mmScale + 'px';
      f.mm.style.width = Math.max(2, FW * mmScale) + 'px';
      f.mm.style.height = Math.max(2, FH * mmScale) + 'px';
      f.mm.classList.toggle('is-selected', selected.has(f.id));
    });
    updateMinimapView();
  }

  function updateMinimapView() {
    if (!mmFrames) return;
    const vw = viewW / cam.z;
    const vh = viewH / cam.z;
    const wx = -cam.x / cam.z;
    const wy = -cam.y / cam.z;

    const x = (wx - mmOrigin.x) * mmScale;
    const y = (wy - mmOrigin.y) * mmScale;
    const x2 = x + vw * mmScale;
    const y2 = y + vh * mmScale;

    const left = clamp(x, 0, mmW);
    const top = clamp(y, 0, mmH);
    const covers = x <= 0 && y <= 0 && x2 >= mmW && y2 >= mmH;
    mmView.style.opacity = covers ? '0' : '1';
    mmView.style.left = left + 'px';
    mmView.style.top = top + 'px';
    mmView.style.width = Math.max(0, clamp(x2, 0, mmW) - left) + 'px';
    mmView.style.height = Math.max(0, clamp(y2, 0, mmH) - top) + 'px';
  }

  // ---------------------------------------------------------------- persistence

  // ---------------------------------------------------------------- storage
  //
  // Layout and comments belong to the project, not the browser: they live in
  // .canvas/ on disk through the server's API, so they travel with the repo,
  // survive a port change, and are what the agent reads. localStorage stays as
  // a fallback for when the canvas is served by a plain static server.

  function snapshot() {
    return {
      frames: frames.map((f) => ({
        id: f.id,
        screen: f.screen,
        route: f.route,
        state: f.state,
        x: f.x,
        y: f.y,
      })),
      comments,
    };
  }

  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;

  function save(immediate) {
    clearTimeout(saveTimer);
    if (immediate) flushSave();
    else saveTimer = setTimeout(flushSave, 400);
  }

  async function flushSave() {
    saveTimer = null;
    if (saveInFlight) {
      saveAgain = true;
      return;
    }
    saveInFlight = true;
    const body = JSON.stringify({ layout: { frames: snapshot().frames, screens: ADDED }, comments });
    try {
      const res = await fetch('/__canvas/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      try {
        localStorage.setItem(STORE, body);
      } catch (storageErr) {
        /* nothing to fall back to */
      }
    } finally {
      saveInFlight = false;
      if (saveAgain) {
        saveAgain = false;
        flushSave();
      }
    }
  }

  async function readStore() {
    try {
      const res = await fetch('/__canvas/state', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const layout = data.layout;
        if (layout && Array.isArray(layout.frames) && layout.frames.length) {
          return { frames: layout.frames, screens: layout.screens || [], comments: data.comments || {} };
        }
        // An empty .canvas/ is not a saved layout — lay the screens out fresh.
        return null;
      }
    } catch (err) {
      /* no API: served statically */
    }
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.frames) return parsed;
      if (parsed && parsed.layout)
        return { frames: parsed.layout.frames, screens: parsed.layout.screens || [], comments: parsed.comments };
    } catch (err) {
      /* unreadable */
    }
    return null;
  }

  // ---------------------------------------------------------------- comments

  function renderDrawer() {
    const ids = [];
    frames.forEach((f) => {
      if (!ids.includes(f.screen)) ids.push(f.screen);
    });

    const groups = ids
      .map((sid) => ({ sid, items: (comments[sid] || []).filter((c) => !c.resolved) }))
      .filter((g) => g.items.length);

    const total = groups.reduce((n, g) => n + g.items.length, 0);
    drawerCount.textContent = total ? String(total) : '';
    commentsCount.textContent = String(total);
    commentsCount.hidden = total === 0;

    if (!groups.length) {
      drawerBody.innerHTML =
        '<div class="drawer__empty"><strong>No comments yet</strong>Select a screen, then Comment to write one — or send it to an agent.</div>';
      return;
    }

    drawerBody.innerHTML = groups
      .map((g) => {
        const frame = frames.find((f) => f.screen === g.sid);
        const title = frame ? frameTitle(frame) : screenMeta(g.sid).title;
        const label = frame ? routeLabel(frame.route, frame.state) : '/' + g.sid;
        return (
          `<div class="cgroup">` +
          `<button type="button" class="cgroup__head" data-goto="${esc(g.sid)}">` +
          `<span class="cgroup__title">${esc(title)}</span>` +
          `<span class="cgroup__route">${esc(label)}</span>` +
          `</button>` +
          g.items
            .map(
              (c) =>
                `<div class="comment"><div class="comment__text">${esc(c.text)}</div>` +
                `<div class="comment__meta"><span>${esc(c.author || 'Agent')}</span><span>${timeAgo(c.ts)}</span>` +
                `<button type="button" class="comment__resolve" data-resolve="${esc(c.id)}" data-screen="${esc(
                  g.sid
                )}">Resolve</button></div></div>`
            )
            .join('') +
          `</div>`
        );
      })
      .join('');
  }

  function openDrawer() {
    drawer.hidden = false;
    document.body.classList.add('has-drawer');
  }

  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove('has-drawer');
  }

  function selectedScreens() {
    const ids = [];
    [...selected].forEach((id) => {
      const f = frames.find((fr) => fr.id === id);
      if (f && !ids.includes(f.screen)) ids.push(f.screen);
    });
    return ids;
  }

  // The agent's mailbox is .canvas/review.json. This posts a request and polls
  // for a reply — the same file a real agent would read and write.
  async function sendToAgent() {
    if (sending || !selected.size) return;
    sending = true;

    const ids = [...selected];
    const screens = selectedScreens().map((sid) => {
      const frame = frames.find((f) => f.screen === sid);
      return {
        id: sid,
        route: frame ? frame.route : sid,
        state: frame ? frame.state : '',
        title: frame ? frameTitle(frame) : screenMeta(sid).title,
        url: frame ? frameSrc(frame.route, frame.state) : frameSrc(sid, ''),
      };
    });

    ids.forEach((id) => {
      const f = frames.find((fr) => fr.id === id);
      if (!f) return;
      f.el.classList.add('is-reviewing');
      f.badgeEl.hidden = false;
      f.badgeEl.textContent = '…';
    });

    const count = screens.length;
    toast(`Sending ${count} ${count === 1 ? 'screen' : 'screens'} to agent…`);

    const clearReviewing = () => {
      ids.forEach((id) => {
        const f = frames.find((fr) => fr.id === id);
        if (f) f.el.classList.remove('is-reviewing');
      });
      frames.filter((f) => ids.includes(f.id)).forEach(refreshBadge);
    };

    try {
      const res = await fetch('/__canvas/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screens, comments: openThreads(screens) }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { requestedAt } = await res.json();

      const reply = await waitForReview(requestedAt);
      const added = mergeReply(reply, screens);

      fetch('/__canvas/review/ack', { method: 'POST' }).catch(() => {});
      save();
      openDrawer();
      toast(
        added
          ? `Agent left ${added} ${added === 1 ? 'comment' : 'comments'} on ${count} ${count === 1 ? 'screen' : 'screens'}`
          : `Agent replied without comments on ${count} ${count === 1 ? 'screen' : 'screens'}`
      );
    } catch (err) {
      toast('No agent reply — ' + (err.message || 'timeout'));
    } finally {
      clearReviewing();
      sending = false;
    }
  }

  // What you wrote on these screens is the brief. Sending the screens without
  // it leaves the agent guessing what "look at this" means.
  function openThreads(screens) {
    const out = {};
    screens.forEach((screen) => {
      const list = (comments[screen.id] || []).filter((c) => !c.resolved);
      if (!list.length) return;
      out[screen.id] = list.map((c) => ({
        text: c.text,
        author: c.author || 'You',
        ts: c.ts || null,
      }));
    });
    return out;
  }

  async function waitForReview(requestedAt, timeout = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await wait(700);
      let review;
      try {
        const res = await fetch('/__canvas/review', { cache: 'no-store' });
        if (!res.ok) continue;
        review = await res.json();
      } catch (err) {
        continue;
      }
      if (!review || review.requestedAt !== requestedAt) continue;
      if (review.status === 'done' && review.reply) return review.reply;
      if (review.status === 'error') throw new Error(review.error || 'agent failed');
    }
    throw new Error('no reply yet');
  }

  function mergeReply(reply, screens) {
    const ts = Date.now();
    const author = reply.author || 'Agent';
    const wanted = new Set(screens.map((s) => s.id));
    let added = 0;

    Object.entries(reply.comments || {}).forEach(([sid, list]) => {
      if (!wanted.has(sid)) return;
      const target = comments[sid] || (comments[sid] = []);
      (list || []).forEach((entry) => {
        const text = typeof entry === 'string' ? entry : entry && entry.text;
        if (!text) return;
        target.push({
          id: 'c' + ts.toString(36) + Math.random().toString(16).slice(2, 6),
          text,
          ts,
          resolved: false,
          author: (entry && entry.author) || author,
        });
        added += 1;
      });
    });

    frames.filter((f) => wanted.has(f.screen)).forEach(refreshBadge);
    renderDrawer();
    return added;
  }

  // ---------------------------------------------------------------- composer

  function openComposer() {
    const screens = selectedScreens();
    if (!screens.length) return;
    picker.hidden = true;
    menuEl.hidden = true;

    composerTitle.textContent =
      screens.length === 1
        ? 'Comment on ' + screenMeta(screens[0]).title
        : 'Comment on ' + screens.length + ' screens';
    composerText.value = '';
    composer.hidden = false;

    const r = selbar.getBoundingClientRect();
    const w = composer.offsetWidth;
    composer.style.left = clamp(r.left + r.width / 2 - w / 2, 10, window.innerWidth - w - 10) + 'px';
    composer.style.top = 'auto';
    composer.style.bottom = window.innerHeight - r.top + 8 + 'px';
    composerText.focus();
  }

  function addComment() {
    const text = composerText.value.trim();
    if (!text) {
      composerText.focus();
      return;
    }
    const screens = selectedScreens();
    const ts = Date.now();
    screens.forEach((sid) => {
      const list = comments[sid] || (comments[sid] = []);
      list.push({
        id: 'c' + ts.toString(36) + Math.random().toString(16).slice(2, 6),
        text,
        ts,
        resolved: false,
        author: 'You',
      });
    });
    frames.filter((f) => screens.includes(f.screen)).forEach(refreshBadge);
    composer.hidden = true;
    renderDrawer();
    openDrawer();
    if (selected.size === 1) {
      const only = frames.find((f) => selected.has(f.id));
      if (only) focusFrame(only);
    }
    save();
    toast('Comment added to ' + screens.length + (screens.length === 1 ? ' screen' : ' screens'));
  }

  // ---------------------------------------------------------------- popovers

  function placePopover(el, anchor) {
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    let left = r.right - w;
    if (left < 10) left = 10;
    el.style.left = left + 'px';
    el.style.top = r.bottom + 6 + 'px';
  }

  function openPicker(anchor) {
    const onCanvas = new Set(frames.map((f) => f.screen));
    const groups = [];
    ROUTES.forEach((r) => {
      let g = groups.find((x) => x.title === r.group);
      if (!g) {
        g = { title: r.group, items: [] };
        groups.push(g);
      }
      g.items.push(r);
    });

    picker.innerHTML =
      groups
        .map(
          (g) =>
            `<div class="popover__title">${esc(g.title)}</div>` +
            g.items
              .map((r) => {
                const sid = screenId(r);
                const on = onCanvas.has(sid);
                return (
                  `<button type="button" class="popover__item${on ? ' is-on' : ''}" data-screen="${esc(sid)}">` +
                  `<span>${esc(r.title)}</span><span>${on ? 'On canvas' : esc(routeLabel(r.key, r.state))}</span>` +
                  `</button>`
                );
              })
              .join('')
        )
        .join('') +
      // A crawler can only follow links, so a drawer that opens from a button is
      // invisible to it. This is how those screens get on the canvas: the route
      // plus the state the app reads.
      `<form class="popover__add" data-add-screen>` +
      `<div class="popover__title">Any screen</div>` +
      `<div class="popover__addrow">` +
      `<input name="route" placeholder="/invoices" aria-label="Route" spellcheck="false" />` +
      `<input name="state" placeholder="state" aria-label="State (optional)" spellcheck="false" />` +
      `<button type="submit" aria-label="Add screen">Add</button>` +
      `</div>` +
      `<div class="popover__hint">Route, then the overlay name your app expects — it opens as its own screen.</div>` +
      `</form>`;

    placePopover(picker, anchor || addBtn);
  }

  function openMenu() {
    menuEl.innerHTML =
      `<button type="button" class="popover__item" data-menu="rescan"><span>Rescan screens</span><span>${ROUTES.length} found</span></button>` +
      `<button type="button" class="popover__item" data-menu="reset"><span>Reset layout</span><span>${frames.length} screens</span></button>` +
      `<button type="button" class="popover__item" data-menu="clear"><span>Clear comments</span><span></span></button>`;
    placePopover(menuEl, menuBtn);
  }

  // ---------------------------------------------------------------- pointer

  stage.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const label = e.target.closest('.frame__label');
    if (label) {
      startMove(e, label.closest('.frame'));
      return;
    }
    const frameEl = e.target.closest('.frame');
    if (frameEl) {
      // Zoomed out, the screens are inert: a press can still drag the frame
      // (so you can rearrange from a distance) but a plain click flies in.
      if (cam.z < 0.5) startMove(e, frameEl, true);
      else startMarquee(e);
      return;
    }
    startMarquee(e);
  });

  // Double-clicking empty canvas is the quickest way to drill in, the way it
  // works in Maps and Figma.
  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.frame, #zoom, #minimap, #selbar')) return;
    if (cam.z >= MAXZ) return;
    zoomAnim(e.clientX - stageLeft, e.clientY - stageTop, cam.z * 1.6, 200);
  });

  framesEl.addEventListener('dblclick', (e) => {
    const label = e.target.closest('.frame__label');
    if (!label) return;
    const frame = frames.find((f) => f.id === label.closest('.frame').dataset.id);
    if (!frame) return;
    selected.clear();
    select(frame.id);
    focusFrame(frame);
  });

  function startPan(e) {
    e.preventDefault();
    stopAnim();
    const start = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    stage.classList.add('is-panning');
    markLive();
    const move = (ev) => {
      cam.x = start.cx + (ev.clientX - start.sx);
      cam.y = start.cy + (ev.clientY - start.sy);
      markLive();
      applyCam();
    };
    const up = () => {
      stage.classList.remove('is-panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startMove(e, frameEl, clickToFly) {
    e.preventDefault();
    stopAnim();
    const id = frameEl.dataset.id;
    const frame = frames.find((f) => f.id === id);
    if (!frame) return;
    if (e.shiftKey) {
      toggleSelect(id);
      return;
    }
    if (!selected.has(id)) {
      selected.clear();
      select(id);
    }

    const start = { sx: e.clientX, sy: e.clientY };
    const origins = frames.filter((f) => selected.has(f.id)).map((f) => ({ f, x: f.x, y: f.y }));
    const anchor = origins.find((o) => o.f.id === id) || origins[0];
    const others = frames.filter((f) => !selected.has(f.id));
    const tol = Math.min(7 / cam.z, SNAP / 2);
    let moved = false;

    // Grid first, then pull onto a neighbour's edge or centre if one is close —
    // that is what makes two frames line up exactly instead of near-miss.
    const edgesX = (x) => [x, x + FW / 2, x + FW];
    const edgesY = (y) => [y, y + FH / 2, y + FH];

    function align(nx, ny, free) {
      let sx = null;
      let sy = null;
      if (!free) {
        others.forEach((o) => {
          edgesX(o.x).forEach((ox) => {
            edgesX(nx).forEach((mx) => {
              const d = ox - mx;
              if (Math.abs(d) <= tol && (!sx || Math.abs(d) < Math.abs(sx.d))) sx = { d, at: ox };
            });
          });
          edgesY(o.y).forEach((oy) => {
            edgesY(ny).forEach((my) => {
              const d = oy - my;
              if (Math.abs(d) <= tol && (!sy || Math.abs(d) < Math.abs(sy.d))) sy = { d, at: oy };
            });
          });
        });
      }
      return { x: nx + (sx ? sx.d : 0), y: ny + (sy ? sy.d : 0), gx: sx, gy: sy };
    }

    const move = (ev) => {
      // The dead zone is in screen pixels — at 20% zoom a world-space threshold
      // would turn every click into a one-pixel drag.
      const sdx = ev.clientX - start.sx;
      const sdy = ev.clientY - start.sy;
      if (!moved && Math.abs(sdx) + Math.abs(sdy) < 4) return;
      const dx = sdx / cam.z;
      const dy = sdy / cam.z;
      if (!moved) {
        moved = true;
        document.body.classList.add('is-dragging');
      }
      // Default: land on the 24px grid, then let a neighbour's edge or centre
      // pull the frame the last few pixels. ⌥ is free 1:1 movement.
      const snapped = ev.altKey
        ? { x: anchor.x + dx, y: anchor.y + dy, gx: null, gy: null }
        : align(Math.round((anchor.x + dx) / SNAP) * SNAP, Math.round((anchor.y + dy) / SNAP) * SNAP, false);
      const offX = snapped.x - anchor.x;
      const offY = snapped.y - anchor.y;
      origins.forEach((o) => {
        o.f.x = o.x + offX;
        o.f.y = o.y + offY;
        o.f.el.style.transform = `translate3d(${o.f.x}px, ${o.f.y}px, 0)`;
      });
      showGuides(snapped.gx, snapped.gy);
      layoutMinimap();
    };

    const up = () => {
      document.body.classList.remove('is-dragging');
      hideGuides();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        buildMinimap();
        save();
      } else if (clickToFly) {
        focusFrame(frame);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function showGuides(gx, gy) {
    const b = bounds();
    guideV.style.display = gx ? 'block' : 'none';
    guideH.style.display = gy ? 'block' : 'none';
    if (gx) {
      guideV.style.left = gx.at + 'px';
      guideV.style.top = b.y - 160 + 'px';
      guideV.style.height = b.h + 320 + 'px';
    }
    if (gy) {
      guideH.style.top = gy.at + 'px';
      guideH.style.left = b.x - 160 + 'px';
      guideH.style.width = b.w + 320 + 'px';
    }
  }

  function hideGuides() {
    guideV.style.display = 'none';
    guideH.style.display = 'none';
  }

  function startMarquee(e) {
    e.preventDefault();
    stopAnim();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;

    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 4) return;
      moved = true;
      const x1 = Math.min(start.x, ev.clientX);
      const x2 = Math.max(start.x, ev.clientX);
      const y1 = Math.min(start.y, ev.clientY);
      const y2 = Math.max(start.y, ev.clientY);

      marquee.style.display = 'block';
      marquee.style.left = x1 + 'px';
      marquee.style.top = y1 + 'px';
      marquee.style.width = x2 - x1 + 'px';
      marquee.style.height = y2 - y1 + 'px';

      const wx1 = (x1 - stageLeft - cam.x) / cam.z;
      const wy1 = (y1 - stageTop - cam.y) / cam.z;
      const wx2 = (x2 - stageLeft - cam.x) / cam.z;
      const wy2 = (y2 - stageTop - cam.y) / cam.z;

      selected.clear();
      frames.forEach((f) => {
        if (f.x < wx2 && f.x + FW > wx1 && f.y < wy2 && f.y + FH > wy1) selected.add(f.id);
      });
      syncSelection();
    };

    const up = () => {
      marquee.style.display = 'none';
      if (!moved) clearSelection();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Wheel deltas arrive in pixels, lines or pages depending on the device.
  function wheelDelta(v, mode) {
    if (mode === 1) return v * 16;
    if (mode === 2) return v * viewH;
    return v;
  }

  function wheelZoom(clientX, clientY, dy) {
    const sx = clientX - stageLeft;
    const sy = clientY - stageTop;
    const d = clamp(dy, -140, 140);
    const factor = Math.exp(-d * 0.0025);
    // A mouse notch is a discrete step, so it gets a short animation; a
    // trackpad or pinch streams small deltas and must track the fingers 1:1.
    if (Math.abs(d) >= 40) {
      zoomAnim(sx, sy, clamp((zoomGoal || cam.z) * factor, MINZ, MAXZ), 110);
    } else {
      zoomAt(sx, sy, factor);
    }
  }

  function wheelPan(dx, dy) {
    const from = glideTarget || { x: cam.x, y: cam.y };
    stopAnim();
    const tx = from.x - clamp(dx, -140, 140);
    const ty = from.y - clamp(dy, -140, 140);
    if (Math.abs(dx) >= 40 || Math.abs(dy) >= 40) {
      glideTo(tx, ty);
    } else {
      cam.x = tx;
      cam.y = ty;
      markLive();
      applyCam();
    }
  }

  function handleWheel(e) {
    // Only gestures over the canvas itself: the drawer and popovers scroll
    // natively, and a wheel over a screen arrives through postMessage instead.
    if (!(e.target instanceof Node) || !stage.contains(e.target)) return;

    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      wheelZoom(e.clientX, e.clientY, wheelDelta(e.deltaY, e.deltaMode));
    } else {
      wheelPan(wheelDelta(e.deltaX, e.deltaMode), wheelDelta(e.deltaY, e.deltaMode));
    }
  }

  // On the document, so ⌘-scroll still zooms when the pointer sits over a
  // screen (iframes swallow wheel events; app.js forwards those to us).
  document.addEventListener('wheel', handleWheel, { passive: false });

  mmFrames.addEventListener('pointerdown', (e) => {
    stopAnim();
    const hit = e.target.closest('.mm');
    if (hit) {
      const frame = frames.find((f) => f.id === hit.dataset.id);
      if (frame) {
        clearSelection();
        select(frame.id);
        focusFrame(frame, false, true);
      }
      return;
    }

    const jump = (ev) => {
      const r = mmFrames.getBoundingClientRect();
      const wx = mmOrigin.x + (ev.clientX - r.left) / mmScale;
      const wy = mmOrigin.y + (ev.clientY - r.top) / mmScale;
      cam.x = viewW / 2 - wx * cam.z;
      cam.y = viewH / 2 - wy * cam.z;
      applyCam();
    };
    jump(e);
    const move = (ev) => jump(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // ---------------------------------------------------------------- keyboard

  function setPanMode(on) {
    spaceDown = on;
    stage.classList.toggle('is-locked', on);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea')) return;

    if (e.code === 'Space' && !e.repeat) {
      setPanMode(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      picker.hidden = true;
      menuEl.hidden = true;
      composer.hidden = true;
      if (!drawer.hidden) closeDrawer();
      clearSelection();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      removeSelected();
      e.preventDefault();
      return;
    }
    if (e.key === '0') fit();
    if (e.key === '1') zoomToCenter(1);
    if (e.key === '=' || e.key === '+') zoomStep(1.25);
    if (e.key === '-' || e.key === '_') zoomStep(0.8);

    const panKeys = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (panKeys[e.key]) {
      const [dx, dy] = panKeys[e.key];
      const step = e.shiftKey ? 320 : 80;
      const from = glideTarget || { x: cam.x, y: cam.y };
      stopAnim();
      glideTo(from.x + dx * step, from.y + dy * step);
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') setPanMode(false);
  });

  window.addEventListener('blur', () => setPanMode(false));

  // ---------------------------------------------------------------- messages

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.source !== 'kestrel-app') return;

    const frame = frames.find((f) => f.iframe && f.iframe.contentWindow === e.source);
    if (!frame) return;

    // `ready` is the same news as `route`, sent once on load. A frame that
    // reloads straight into a drawer must relabel itself even though its route
    // never changed, so both messages compare route *and* state.
    if ((data.type === 'route' || data.type === 'ready') && data.route) {
      const state = data.state || '';
      if (data.route !== frame.route || state !== frame.state) {
        frame.route = data.route;
        frame.state = state;
        updateFrameMeta(frame);
        save();
      }
    }

    if (data.type === 'state' && typeof data.state === 'string' && data.state !== frame.state) {
      frame.state = data.state;
      updateFrameMeta(frame);
      save();
    }

    if (data.type === 'key') {
      if (data.key === 'Escape') clearSelection();
      if (data.key === ' ') setPanMode(!!data.down);
    }

    if (data.type === 'wheel' && frame.iframe) {
      // Coordinates arrive in the screen's own pixels; the frame is scaled, so
      // map them back onto the page before handing them to the camera.
      const r = frame.iframe.getBoundingClientRect();
      const k = r.width / (frame.iframe.clientWidth || FW);
      wheelZoom(r.left + data.x * k, r.top + data.y * k, wheelDelta(data.deltaY, data.deltaMode));
    }
  });

  // ---------------------------------------------------------------- chrome

  addBtn.addEventListener('click', () => {
    if (picker.hidden) openPicker();
    else picker.hidden = true;
  });

  emptyAdd.addEventListener('click', () => openPicker(emptyAdd));

  commentsBtn.addEventListener('click', () => {
    if (drawer.hidden) openDrawer();
    else closeDrawer();
  });

  menuBtn.addEventListener('click', () => {
    if (menuEl.hidden) openMenu();
    else menuEl.hidden = true;
  });

  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('sendBtn').addEventListener('click', sendToAgent);
  document.getElementById('clearBtn').addEventListener('click', clearSelection);
  commentBtn.addEventListener('click', openComposer);
  document.getElementById('composerAdd').addEventListener('click', addComment);

  composerText.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      addComment();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      composer.hidden = true;
    }
  });

  document.getElementById('zoomIn').addEventListener('click', () => zoomStep(1.25));
  document.getElementById('zoomOut').addEventListener('click', () => zoomStep(0.8));
  document.getElementById('zoomFit').addEventListener('click', () => fit());

  picker.addEventListener('click', (e) => {
    const item = e.target.closest('[data-screen]');
    if (!item) return;
    const sid = item.dataset.screen;
    picker.hidden = true;

    const existing = frames.find((f) => f.screen === sid);
    if (existing) {
      clearSelection();
      select(existing.id);
      focusFrame(existing);
      return;
    }

    const slot = freeSlot();
    const frame = addFrame(sid, slot[0], slot[1]);
    clearSelection();
    select(frame.id);
    buildMinimap();
    save();
    focusFrame(frame);
  });

  picker.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-add-screen]');
    if (!form) return;
    e.preventDefault();

    const raw = form.querySelector('[name="route"]').value.trim();
    const state = form
      .querySelector('[name="state"]')
      .value.trim()
      .replace(/^[?&]/, '')
      .replace(/^state=/, '');
    const key = raw.replace(/^\/+/, '').replace(/\/+$/, '');

    if (!key && !state) {
      toast('Give the screen a route');
      return;
    }

    const screen = {
      key,
      state,
      title: titleFromRoute(state || key),
      group: 'Added',
    };
    const sid = screenId(screen);
    picker.hidden = true;

    const existing = frames.find((f) => f.screen === sid);
    if (existing) {
      clearSelection();
      select(existing.id);
      focusFrame(existing);
      return;
    }

    if (!ROUTES.some((r) => screenId(r) === sid)) {
      ROUTES.push(screen);
      ADDED.push(screen);
    }

    const slot = freeSlot();
    const frame = addFrame(sid, slot[0], slot[1]);
    clearSelection();
    select(frame.id);
    buildMinimap();
    save();
    focusFrame(frame);
  });

  menuEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    menuEl.hidden = true;
    if (item.dataset.menu === 'rescan') {
      try {
        localStorage.removeItem(CRAWL_KEY);
      } catch (err) {
        /* storage unavailable */
      }
      location.reload();
      return;
    }
    if (item.dataset.menu === 'reset') resetLayout();
    if (item.dataset.menu === 'clear') {
      comments = {};
      frames.forEach(refreshBadge);
      renderDrawer();
      save();
      toast('Comments cleared');
    }
  });

  drawerBody.addEventListener('click', (e) => {
    const resolve = e.target.closest('[data-resolve]');
    if (resolve) {
      const sid = resolve.dataset.screen;
      const list = comments[sid] || [];
      const comment = list.find((c) => c.id === resolve.dataset.resolve);
      if (comment) comment.resolved = true;
      frames.filter((f) => f.screen === sid).forEach(refreshBadge);
      renderDrawer();
      save();
      return;
    }
    const go = e.target.closest('[data-goto]');
    if (go) {
      const frame = frames.find((f) => f.screen === go.dataset.goto);
      if (frame) {
        clearSelection();
        select(frame.id);
        focusFrame(frame);
      }
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!picker.hidden && !picker.contains(e.target) && !addBtn.contains(e.target)) picker.hidden = true;
    if (!menuEl.hidden && !menuEl.contains(e.target) && !menuBtn.contains(e.target)) menuEl.hidden = true;
    if (!composer.hidden && !composer.contains(e.target) && !commentBtn.contains(e.target)) composer.hidden = true;
  });

  // ---------------------------------------------------------------- live edits
  //
  // The loop this tool exists for: you leave a comment, an agent edits the code,
  // and you watch the fix land on the frame instead of trusting a description of
  // it. A dev server with HMR pushes updates itself; the server watches the app
  // folder for everything else and tells us here.

  // A stylesheet can be swapped in place: no reload, so the frame keeps its
  // scroll position, its filters and its open drawer while you iterate on looks.
  function swapStylesheets(doc, file) {
    const name = String(file).split('/').pop();
    if (!name) return 0;
    let swapped = 0;
    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (!href.split('?')[0].endsWith(name)) return;
      const url = new URL(href, doc.baseURI);
      url.searchParams.set('v', String(Date.now()));
      link.setAttribute('href', url.pathname + url.search);
      swapped += 1;
    });
    return swapped;
  }

  function applyChange(payload) {
    const file = payload && payload.file ? payload.file : '';
    const isCss = /\.css$/i.test(file);
    const touched = [];

    frames.forEach((frame) => {
      const doc = (frame.iframe && frame.iframe.contentDocument) || null;
      if (!doc) return;

      if (isCss && swapStylesheets(doc, file)) {
        touched.push(frame);
        return;
      }
      // Anything else — markup, scripts, data — needs the document again.
      // reload() keeps whatever route the frame navigated to, so a fix lands
      // where you were looking rather than snapping back to the screen's start.
      try {
        frame.iframe.contentWindow.location.reload();
        touched.push(frame);
      } catch (err) {
        /* frame not ready */
      }
    });

    if (!touched.length) return;
    touched.forEach((frame) => {
      frame.el.classList.remove('is-updated');
      // restart the animation if a second change arrives mid-flash
      void frame.el.offsetWidth;
      frame.el.classList.add('is-updated');
    });
    clearTimeout(applyChange.timer);
    applyChange.timer = setTimeout(() => {
      touched.forEach((frame) => frame.el.classList.remove('is-updated'));
    }, 1500);
  }

  function listenForEdits() {
    if (!window.EventSource) return;
    let timer = null;
    let pending = null;
    const es = new EventSource('/__canvas/events');
    es.addEventListener('change', (e) => {
      try {
        pending = JSON.parse(e.data);
      } catch (err) {
        pending = null;
      }
      // Several files on one save (a component and its stylesheet) are one
      // moment, not several.
      clearTimeout(timer);
      timer = setTimeout(() => applyChange(pending), 120);
    });
  }

  // ---------------------------------------------------------------- boot
  //
  // Screens arrive from the server: the project's config if it has one,
  // otherwise a crawl of the running app. Both are the same manifest shape.

  const CRAWL_KEY = 'canvas.crawl.v1';

  function cachedCrawl() {
    try {
      const raw = localStorage.getItem(CRAWL_KEY);
      if (!raw) return null;
      const hit = JSON.parse(raw);
      if (!hit || hit.origin !== location.origin || !Array.isArray(hit.screens)) return null;
      return hit.screens;
    } catch (err) {
      return null;
    }
  }

  function cacheCrawl(screens) {
    try {
      localStorage.setItem(CRAWL_KEY, JSON.stringify({ origin: location.origin, screens }));
    } catch (err) {
      /* storage unavailable */
    }
  }

  async function loadManifest() {
    try {
      const res = await fetch('/__canvas/manifest', { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (err) {
      /* served statically */
    }
    return { screens: [], router: 'path', title: '' };
  }

  function applyTitle() {
    const name = APP_TITLE || 'Infinite canvas';
    brandName.textContent = name;
    brandMark.textContent = (name[0] || 'C').toUpperCase();
    document.title = name + ' — canvas';
  }

  async function resolveScreens(manifest) {
    if (manifest.screens && manifest.screens.length) return manifest.screens;

    const cached = cachedCrawl();
    if (cached && cached.length) return cached;

    if (!window.CANVAS_CRAWL) return [];
    toast('Finding screens…');
    let found = [];
    try {
      found = await window.CANVAS_CRAWL.run({
        router: ROUTER,
        max: 40,
        onProgress: (n) => toast(`Finding screens… ${n}`),
      });
    } catch (err) {
      found = [];
    }
    if (found.length) cacheCrawl(found);
    return found;
  }

  function init(saved) {
    measure();
    let fresh = false;
    if (saved && Array.isArray(saved.frames) && saved.frames.length) {
      comments = saved.comments || {};
      saved.frames.forEach((f) => addFrame(f.screen || f.route, f.x, f.y, f.id, f.route, f.state));
      uid = saved.frames.length + 1;
    } else {
      layoutAll();
      fresh = true;
    }
    syncSelection();
    buildMinimap();
    renderDrawer();
    updateEmpty();
    if (frames.length) fit(true);
    // First run in a project: write the layout straight away, so .canvas/ exists
    // and can be committed before anyone moves a frame.
    if (fresh && frames.length) save(true);
  }

  async function boot() {
    const manifest = await loadManifest();
    ROUTER = manifest.router || 'path';
    APP_TITLE = manifest.title || '';
    applyTitle();

    ROUTES = await resolveScreens(manifest);

    const saved = await readStore();
    // Screens added by hand come back with the layout; the crawler will never
    // find them again on its own.
    ADDED = (saved && Array.isArray(saved.screens) ? saved.screens : []).filter(
      (s) => s && typeof s.key === 'string'
    );
    ADDED.forEach((s) => {
      if (!ROUTES.some((r) => screenId(r) === screenId(s))) ROUTES.push(s);
    });

    init(saved);
    listenForEdits();

    if (!ROUTES.length) {
      toast('No screens found — add a canvas.config.mjs or run with --crawl');
    }
  }

  // A debounced write can still be in flight when the tab closes.
  window.addEventListener('beforeunload', () => {
    if (saveTimer) save(true);
  });

  // The stage is the viewport: re-measure so zoom-at-point and fit stay honest
  // after a window resize.
  window.addEventListener('resize', () => {
    measure();
    applyCam();
  });

  boot();
})();
