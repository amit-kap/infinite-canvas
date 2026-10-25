// The canvas server: it owns /__canvas/*, and hands everything else to the app
// — either a folder on disk or a dev server it proxies to. Proxying is what
// makes the app and the tool one origin, which is what iframes and postMessage
// require; nothing about the app has to change for it.
//
// Zero dependencies: node's http client is enough for a localhost proxy.

const http = require('http');
const fs = require('fs');
const path = require('path');

const TOOL = '/__canvas';
const MAX_BODY = 4 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const typeFor = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

// ---------------------------------------------------------------- live edits

// The point of the tool is the loop: you leave a comment, an agent edits the
// code, and the frame shows you the fix. A dev server with HMR pushes that
// itself; a folder of files does not, so the canvas watches it and tells the
// browser. One watcher, one event stream, no polling.
const IGNORED = /(^|\/)(node_modules|\.git|\.canvas|\.next|\.nuxt|\.svelte-kit|dist|build|coverage)(\/|$)/;

const clients = new Set();

function sse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // An immediate comment flushes headers, so EventSource fires onopen now
  // rather than whenever the first change happens.
  res.write(': connected\n\n');
  clients.add(res);

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  const done = () => {
    clearInterval(ping);
    clients.delete(res);
  };
  req.on('close', done);
  res.on('error', done);
}

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch (err) {
      clients.delete(res);
    }
  }
}

function watchApp(dir, onFile) {
  let timer = null;
  let last = '';
  let watcher;
  try {
    watcher = fs.watch(dir, { recursive: true }, (event, file) => {
      if (!file || IGNORED.test(file)) return;
      last = file;
      // Editors save by writing a temp file and renaming it, which arrives as
      // several events; one debounce turns that into one change.
      clearTimeout(timer);
      timer = setTimeout(() => onFile(last), 140);
    });
  } catch (err) {
    return null;
  }
  watcher.on('error', () => {});
  return () => {
    clearTimeout(timer);
    try {
      watcher.close();
    } catch (err) {
      /* already closed */
    }
  };
}

// ---------------------------------------------------------------- glue

const GLUE_TAG = `<script src="${TOOL}/glue.js"></script>`;

// An app should not have to know the canvas exists. Injecting the channel keeps
// that true: the app is served byte-for-byte as it was written, plus one script.
function injectGlue(html) {
  if (html.includes(GLUE_TAG)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, GLUE_TAG + '</head>');
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, GLUE_TAG + '</body>');
  return GLUE_TAG + html;
}

// ---------------------------------------------------------------- files

// A path-routed app that links `app.css` (relative) resolves it against the
// route — /accounts/app.css — which 404s the moment a frame shows /accounts.
// Real servers break the same way, so this is usually an app bug the canvas has
// just surfaced. Rather than make people rewrite every href, pin the document
// to the origin: a base tag makes relative URLs resolve the way the app meant
// when it lived at /. Apps that ship their own <base> keep it.
function injectBase(html) {
  if (/<base\s/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + '<base href="/">');
  return '<base href="/">' + html;
}

function sendFile(res, file, { inject, base } = {}) {
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const isHtml = path.extname(file).toLowerCase() === '.html';
    if (isHtml && (inject || base)) {
      let html = body.toString('utf8');
      if (base) html = injectBase(html);
      if (inject) html = injectGlue(html);
      body = Buffer.from(html, 'utf8');
    }

    res.writeHead(200, {
      'Content-Type': typeFor(file),
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
}

// Resolve a URL path inside a root, refusing anything that escapes it.
function resolveInside(root, pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const file = path.join(root, clean);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return file;
}

function serveStatic(res, root, pathname, { spa }) {
  const file = resolveInside(root, pathname);
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return sendFile(res, path.join(file, 'index.html'), { inject: true, base: spa });
    }
    if (!err && stat.isFile()) {
      return sendFile(res, file, { inject: true, base: spa });
    }
    // SPA fallback: /cases is a route, not a missing file.
    if (spa && !path.extname(file)) {
      return sendFile(res, path.join(root, 'index.html'), { inject: true, base: true });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  });
}

// ---------------------------------------------------------------- proxy

// A dev server answers with its own origin in `Location`; following that would
// take the frame out of the proxy and break the one-origin rule.
function rewriteLocation(location, origin) {
  if (!location) return location;
  try {
    const abs = new URL(location, origin);
    const base = new URL(origin);
    if (abs.origin === base.origin) return abs.pathname + abs.search + abs.hash;
  } catch (err) {
    /* leave it alone */
  }
  return location;
}

// Headers that stop a page from being framed. The canvas *is* the frame host, so
// an app that refuses framing has to be overruled — that is the tool's whole job.
function unframe(headers) {
  delete headers['x-frame-options'];
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  return headers;
}

function proxy(req, res, url, origin) {
  const target = new URL(url.pathname + url.search, origin);

  const headers = { ...req.headers, host: target.host, 'accept-encoding': 'identity' };
  delete headers.connection;
  delete headers['content-length'];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (up) => {
      const type = String(up.headers['content-type'] || '');
      const isHtml = type.includes('text/html');

      if (!isHtml) {
        const out = unframe({ ...up.headers });
        if (out.location) out.location = rewriteLocation(out.location, origin);
        res.writeHead(up.statusCode || 502, out);
        up.pipe(res);
        return;
      }

      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const body = Buffer.from(injectGlue(Buffer.concat(chunks).toString('utf8')), 'utf8');
        const out = unframe({ ...up.headers });
        delete out['content-encoding'];
        delete out['transfer-encoding'];
        out['content-length'] = body.length;
        out['cache-control'] = 'no-store';

        res.writeHead(up.statusCode || 200, out);
        res.end(body);
      });
    }
  );

  upstream.on('error', (err) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>App unreachable</title>` +
        `<body style="font:14px/1.6 system-ui;padding:40px;max-width:52ch;color:#17171a">` +
        `<h1 style="font-size:16px">Could not reach ${origin}</h1>` +
        `<p style="color:#555">Start your dev server, then reload. The canvas proxies to it, ` +
        `so it has to be running.</p>` +
        `<p style="color:#888;font-family:ui-monospace,monospace;font-size:12px">${err.message}</p>`
    );
  });

  req.pipe(upstream);
}

// Dev servers keep their hot-reload channel on a WebSocket. Without this, a Vite
// or Next frame never finishes booting and nothing in it updates.
function proxyUpgrade(req, socket, head, origin) {
  let target;
  try {
    target = new URL(req.url, origin);
  } catch (err) {
    return socket.destroy();
  }

  const headers = { ...req.headers, host: target.host };
  delete headers['content-length'];

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers,
  });

  upstream.on('upgrade', (up, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${up.statusCode} ${up.statusMessage}`];
    for (let i = 0; i < up.rawHeaders.length; i += 2) {
      lines.push(`${up.rawHeaders[i]}: ${up.rawHeaders[i + 1]}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (upHead && upHead.length) socket.write(upHead);
    if (head && head.length) upSocket.write(head);

    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });

  upstream.on('error', () => socket.destroy());
  upstream.end();
}

// ---------------------------------------------------------------- api

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function api(req, res, rest, ctx) {
  const json = (code, value) => {
    const body = Buffer.from(JSON.stringify(value), 'utf8');
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  };

  const reviewFile = path.join(ctx.stateDir, 'review.json');

  const readBody = (done) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        json(400, { error: 'Expected JSON' });
      }
    });
  };

  if (rest === 'manifest') {
    return json(200, {
      title: ctx.config.title,
      router: ctx.config.router || 'path',
      screens: ctx.config.screens,
      source: ctx.config.screens.length ? 'config' : 'crawl',
      app: ctx.app.label,
    });
  }

  // The agent's mailbox. The canvas posts a review request; an agent — this one
  // is a stub, a real one would be a process or an MCP tool — reads the same
  // file, writes a reply, and the canvas picks it up. No shared memory, no
  // protocol beyond JSON on disk.
  if (rest === 'events') {
    return sse(req, res);
  }

  if (rest === 'review') {
    if (req.method === 'GET') {
      return json(200, readJson(reviewFile, { status: 'idle', reply: null }));
    }
    if (req.method === 'POST') {
      return readBody((body) => {
        const request = {
          status: 'pending',
          requestedAt: Date.now(),
          author: body.author || 'You',
          screens: body.screens || [],
          // The threads you wrote are the instruction. Without them the agent
          // can only guess what "look at this screen" means.
          comments: body.comments || {},
          reply: null,
        };
        try {
          writeJson(reviewFile, request);
        } catch (err) {
          return json(500, { error: err.message });
        }
        json(200, { ok: true, requestedAt: request.requestedAt });
      });
    }
    if (req.method === 'DELETE') {
      writeJson(reviewFile, { status: 'idle', reply: null });
      return json(200, { ok: true });
    }
    return json(405, { error: 'GET, POST or DELETE' });
  }

  if (rest === 'review/ack') {
    const current = readJson(reviewFile, null);
    if (current && current.status === 'done') {
      writeJson(reviewFile, { ...current, status: 'acked' });
    }
    return json(200, { ok: true });
  }

  if (rest === 'state') {
    if (req.method === 'GET') {
      return json(200, {
        layout: readJson(path.join(ctx.stateDir, 'layout.json'), null),
        comments: readJson(path.join(ctx.stateDir, 'comments.json'), {}),
      });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      return readBody((body) => {
        try {
          if (body.layout !== undefined) writeJson(path.join(ctx.stateDir, 'layout.json'), body.layout);
          if (body.comments !== undefined) writeJson(path.join(ctx.stateDir, 'comments.json'), body.comments);
        } catch (err) {
          return json(500, { error: err.message });
        }
        json(200, { ok: true });
      });
    }
    return json(405, { error: 'GET or PUT' });
  }

  json(404, { error: 'Unknown endpoint' });
}

// ---------------------------------------------------------------- server

function start({ app, port, config, toolDir, stateDir, onReady }) {
  const ctx = { app, config, stateDir };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));

    if (url.pathname === TOOL) {
      res.writeHead(302, { Location: TOOL + '/' + url.search }).end();
      return;
    }

    if (url.pathname.startsWith(TOOL + '/')) {
      const rest = url.pathname.slice(TOOL.length + 1);
      if (rest === 'manifest' || rest === 'state' || rest === 'review' || rest === 'review/ack' || rest === 'events') {
        return api(req, res, rest, ctx);
      }
      if (rest === '' || rest === 'index.html') {
        return sendFile(res, path.join(toolDir, 'index.html'));
      }
      return serveStatic(res, toolDir, '/' + rest, { spa: false });
    }

    if (app.kind === 'dir') return serveStatic(res, app.path, url.pathname, { spa: true });
    return proxy(req, res, url, app.origin);
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
    if (url.pathname.startsWith(TOOL) || app.kind !== 'proxy') {
      socket.destroy();
      return;
    }
    proxyUpgrade(req, socket, head, app.origin);
  });

  // Only a folder can be watched. A proxied dev server already has HMR pushing
  // into the frames, which is the same thing done better.
  const unwatch =
    app.kind === 'dir'
      ? watchApp(app.path, (file) => broadcast('change', { file, at: Date.now() }))
      : null;

  server.on('close', () => {
    if (unwatch) unwatch();
    for (const res of clients) res.end();
    clients.clear();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}${TOOL}/`;
      if (onReady) onReady(url);
      resolve({ server, url });
    });
  });
}

module.exports = { start, injectGlue, TOOL };
