// Finds an app's screens without a manifest.
//
// Parsing the HTML an app serves only works for server-rendered pages: a React
// or Vue app ships a shell and builds its nav in the browser. So this crawls a
// hidden iframe instead — a real page, rendered, with the app's own router.
// One screen at a time, breadth-first, capped.
(function () {
  'use strict';

  const SETTLE = 200; // after `load`, give the app a beat to paint its nav
  const PAGE_TIMEOUT = 3000;

  const isAsset = (path) => /\.(png|jpe?g|gif|svg|webp|ico|css|js|json|map|woff2?|ttf|pdf|zip)$/i.test(path);

  function clean(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function titleFromRoute(route) {
    const last = String(route).split('/').filter(Boolean).pop() || '';
    return last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Home';
  }

  function urlFor(route, router) {
    if (router === 'query') return '/?r=' + encodeURIComponent(route);
    return '/' + String(route).replace(/^\/+/, '');
  }

  // The label a nav item sits under: the nearest heading or label-ish element
  // before it, inside the same nav container.
  function groupFor(el) {
    const scope = el.closest('nav, [role="navigation"], aside, menu') || el.ownerDocument.body;
    const walker = el.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    let group = '';
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node === el) break;
      const tag = node.tagName.toLowerCase();
      const cls = typeof node.className === 'string' ? node.className : '';
      const labelish = /(^|[-_ ])(label|group|section|heading|eyebrow|kicker|caption)([-_ ]|$)/i.test(cls);
      if (/^h[1-6]$/.test(tag) || labelish) {
        const text = clean(node.textContent);
        if (text && text.length < 40) group = text;
      }
    }
    return group || 'Screens';
  }

  function routeFromHref(href, router, base) {
    let url;
    try {
      url = new URL(href, base);
    } catch (err) {
      return null;
    }
    if (url.origin !== base.origin) return null;
    if (isAsset(url.pathname)) return null;

    if (router === 'query') return url.searchParams.get('r') || (url.pathname === '/' ? '' : null);
    return url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  // Everything on a rendered page that looks like a way into a screen.
  // Several pages link to the same route with different text (a nav item says
  // "Cases", a table row says "Impossible travel escalated CAS-2291 · 2h ago"),
  // so titles compete: nav beats body, then the shorter label wins.
  function collect(doc, router, base) {
    const found = new Map();
    const nodes = doc.querySelectorAll('a[href], [data-nav], [data-route], [data-href]');

    nodes.forEach((el) => {
      let route = null;
      if (el.hasAttribute('href')) {
        const href = el.getAttribute('href') || '';
        if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;
        route = routeFromHref(href, router, base);
      } else {
        const raw = el.getAttribute('data-nav') || el.getAttribute('data-route') || el.getAttribute('data-href') || '';
        if (!raw || raw.startsWith('#') || raw.startsWith('http')) return;
        route = raw.replace(/^\/+/, '').replace(/^\?r=/, '').replace(/\?.*$/, '');
      }
      if (route === null) return;

      const text =
        clean(el.getAttribute('aria-label')) ||
        clean(el.textContent) ||
        clean(el.getAttribute('title')) ||
        titleFromRoute(route);

      const inNav = !!el.closest('nav, [role="navigation"], aside, menu');
      const score = inNav ? 2 : 1;
      const prev = found.get(route);

      if (!prev) {
        found.set(route, { key: route, title: text.slice(0, 60), group: groupFor(el), score });
      } else if (score > prev.score || (score === prev.score && text.length && text.length < prev.title.length)) {
        prev.title = text.slice(0, 60) || prev.title;
        prev.score = score;
      }
    });

    return [...found.values()];
  }

  // The name a screen gives itself. Not document.title: in an SPA that is the
  // app's name on every page. Content beats the header bar, which often carries
  // a generic label ("Case detail") while the body names the actual record.
  function pageTitle(doc) {
    const body = doc.querySelector('main, [role="main"]') || doc.body;

    const h1 = body.querySelector('h1');
    if (h1) {
      const text = clean(h1.textContent);
      if (text) return text;
    }

    const candidates = body.querySelectorAll('h2, [class*="title"], [class*="heading"]');
    for (const el of candidates) {
      if (el.closest('header, nav, [role="navigation"], [role="banner"]')) continue;
      const text = clean(el.textContent);
      if (text && text.length >= 3 && text.length <= 60) return text;
    }

    const header = doc.querySelector('header, [role="banner"]');
    if (header) {
      const el = header.querySelector('h1, h2, [class*="title"]');
      const text = clean(el && el.textContent);
      if (text && text.length <= 60) return text;
    }

    return clean(doc.title) || 'Home';
  }

  function visit(iframe, url) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        iframe.removeEventListener('load', onLoad);
        setTimeout(() => resolve(ok), SETTLE);
      };
      const onLoad = () => finish(true);
      const timer = setTimeout(() => finish(false), PAGE_TIMEOUT);
      iframe.addEventListener('load', onLoad);
      iframe.src = url;
    });
  }

  async function run({ router = 'path', max = 40, onProgress } = {}) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:fixed;left:-20000px;top:0;width:1280px;height:800px;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const base = new URL(location.origin);
    const queue = [{ key: '', title: 'Home', group: 'Screens' }];
    const seen = new Set();
    const out = [];

    try {
      while (queue.length && out.length < max) {
        const item = queue.shift();
        if (seen.has(item.key)) continue;
        seen.add(item.key);

        const ok = await visit(iframe, urlFor(item.key, router));
        if (!ok) continue;

        const doc = iframe.contentDocument;
        if (!doc) continue;

        // The page's own heading beats a link label from another screen: a table
        // row linking to a case says "Impossible travel escalated CAS-2291 · 2h
        // ago", while the case page calls itself "Impossible travel escalated".
        const own = pageTitle(doc);
        const linked = item.title;
        // A nav label is a real screen name; anything else is a guess from a
        // link, and the page's own heading is the better guess.
        const title = !item.key ? own : item.score >= 2 && linked ? linked : own || linked;

        out.push({ key: item.key, title: String(title).slice(0, 60), group: item.group });
        if (onProgress) onProgress(out.length);

        collect(doc, router, base).forEach((next) => {
          if (!seen.has(next.key) && !queue.some((q) => q.key === next.key)) queue.push(next);
        });
      }
    } finally {
      iframe.remove();
    }

    // With a query-string router, `/` is the app's default route, which the
    // crawl already visits under its own name — keeping it would duplicate it.
    return router === 'query' ? out.filter((s) => s.key !== '') : out;
  }

  window.CANVAS_CRAWL = { run };
})();
