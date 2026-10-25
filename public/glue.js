// Injected into every HTML page the canvas serves. This is the only thing the
// tool needs from an app, and the app does not have to know it exists:
//
//   · reports route + overlay state to the parent, so a frame's label stays honest
//   · hands ⌘/Ctrl-wheel to the parent, so zoom works over a live screen
//
// An app that already does this itself can keep doing it — the canvas only acts
// when the route actually changes, so duplicate messages are no-ops.
(function () {
  'use strict';
  if (window.__canvasGlue) return;
  window.__canvasGlue = true;

  var router = 'path';
  try {
    var src = (document.currentScript && document.currentScript.src) || '';
    router = new URL(src).searchParams.get('router') || 'path';
  } catch (err) {
    /* keep the default */
  }

  function readRoute() {
    if (router === 'query') return new URLSearchParams(location.search).get('r') || '';
    return location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function readState() {
    return new URLSearchParams(location.search).get('state') || '';
  }

  function post(type, payload) {
    try {
      if (window.parent !== window) {
        window.parent.postMessage(Object.assign({ source: 'kestrel-app', type: type }, payload), '*');
      }
    } catch (err) {
      /* parent unavailable */
    }
  }

  var last = null;

  function announce(type) {
    var now = readRoute() + '\u0000' + readState();
    if (now === last) return;
    last = now;
    post(type || 'route', { route: readRoute(), state: readState() });
  }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var out = original.apply(this, arguments);
      announce();
      return out;
    };
  });

  window.addEventListener('popstate', function () {
    announce();
  });
  window.addEventListener('hashchange', function () {
    announce();
  });

  // A wheel over an iframe never reaches the canvas, which would freeze zoom the
  // moment the pointer sat on a screen.
  document.addEventListener(
    'wheel',
    function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      post('wheel', { deltaY: e.deltaY, deltaMode: e.deltaMode, x: e.clientX, y: e.clientY });
    },
    { passive: false }
  );

  announce('ready');
})();
