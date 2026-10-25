(function () {
  'use strict';

  const D = window.LEDGER_DATA;

  const state = {
    path: readPath(),
    overlay: new URLSearchParams(location.search).get('state') || '',
    filter: 'all',
    query: '',
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function readPath() {
    return location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------- routing

  function go(path) {
    if (readPath() === path) return;
    history.pushState(null, '', '/' + path);
    state.path = path;
    state.overlay = '';
    render();
    announce();
  }

  function openOverlay(name) {
    state.overlay = name;
    history.replaceState(null, '', location.pathname + '?state=' + name);
    render();
    announce();
  }

  function closeOverlay() {
    if (!state.overlay) return;
    state.overlay = '';
    history.replaceState(null, '', location.pathname);
    render();
    announce();
  }

  function announce() {
    try {
      if (window.parent !== window) {
        window.parent.postMessage(
          { source: 'kestrel-app', type: 'route', route: readPath(), state: state.overlay },
          '*'
        );
      }
    } catch (err) {
      /* no parent */
    }
  }

  window.addEventListener('popstate', () => {
    state.path = readPath();
    state.overlay = new URLSearchParams(location.search).get('state') || '';
    render();
    announce();
  });

  // ---------------------------------------------------------------- chrome

  const NAV = [
    { group: 'Money', items: [['', 'Overview'], ['accounts', 'Accounts'], ['invoices', 'Invoices']] },
    { group: 'Books', items: [['reports', 'Reports'], ['journal', 'Journal']] },
    { group: 'Settings', items: [['settings', 'Settings']] },
  ];

  function navHTML() {
    const base = state.path.split('/')[0];
    return NAV.map(
      (g) =>
        `<div class="nav__group"><div class="nav__label">${esc(g.group)}</div>` +
        g.items
          .map(
            ([path, label]) =>
              `<a class="nav__item${path === base ? ' on' : ''}" href="/${path}">${esc(label)}</a>`
          )
          .join('') +
        `</div>`
    ).join('');
  }

  // ---------------------------------------------------------------- pages

  function pageOverview() {
    const total = D.accounts.reduce((n, a) => n + a.balance, 0);
    const due = D.invoices.filter((i) => i.status !== 'Paid').reduce((n, i) => n + i.amount, 0);
    return {
      title: 'Overview',
      sub: 'This month',
      body: `
        <div class="cards">
          <div class="card"><div class="label">Cash on hand</div><div class="big">${money(total)}</div></div>
          <div class="card"><div class="label">Outstanding</div><div class="big">${money(due)}</div></div>
          <div class="card"><div class="label">Invoices overdue</div><div class="big">${D.invoices.filter((i) => i.status === 'Overdue').length}</div></div>
        </div>
        <div class="card">
          <div class="card__head"><span>Recent activity</span><button class="btn" data-go="journal">Open journal</button></div>
          <div class="rows">
            ${D.entries
              .slice(0, 5)
              .map(
                (e) =>
                  `<div class="row"><div><div class="row__main">${esc(e.memo)}</div><div class="row__sub">${esc(e.account)} · ${e.date}</div></div><div class="row__right ${e.amount < 0 ? 'neg' : 'pos'}">${money(e.amount)}</div></div>`
              )
              .join('')}
          </div>
        </div>`,
    };
  }

  function pageAccounts() {
    return {
      title: 'Accounts',
      sub: `${D.accounts.length} accounts`,
      body: `
        <div class="card">
          <div class="rows">
            ${D.accounts
              .map(
                (a) =>
                  `<a class="row row--link" href="/accounts/${a.id}"><div><div class="row__main">${esc(a.name)}</div><div class="row__sub">${esc(a.type)} · ${a.id}</div></div><div class="row__right">${money(a.balance)}</div></a>`
              )
              .join('')}
          </div>
        </div>`,
    };
  }

  function pageAccount(id) {
    const account = D.accounts.find((a) => a.id === id) || D.accounts[0];
    const entries = D.entries.filter((e) => e.account === account.name);
    return {
      title: account.name,
      sub: `${account.type} · ${account.id}`,
      body: `
        <div class="cards">
          <div class="card"><div class="label">Balance</div><div class="big">${money(account.balance)}</div></div>
          <div class="card"><div class="label">Entries</div><div class="big">${entries.length}</div></div>
        </div>
        <div class="card">
          <div class="card__head"><span>Ledger</span><button class="btn btn--primary" data-overlay="new-entry">New entry</button></div>
          <div class="rows">
            ${
              entries.length
                ? entries
                    .map(
                      (e) =>
                        `<div class="row"><div><div class="row__main">${esc(e.memo)}</div><div class="row__sub">${e.date}</div></div><div class="row__right ${e.amount < 0 ? 'neg' : 'pos'}">${money(e.amount)}</div></div>`
                    )
                    .join('')
                : '<div class="empty">No entries yet.</div>'
            }
          </div>
        </div>`,
    };
  }

  function pageInvoices() {
    const list = D.invoices.filter((i) => state.filter === 'all' || i.status === state.filter);
    return {
      title: 'Invoices',
      sub: `${D.invoices.length} this quarter`,
      actions: `<button class="btn btn--primary" data-overlay="new-invoice">New invoice</button>`,
      body: `
        <div class="chips">
          ${['all', 'Open', 'Overdue', 'Paid']
            .map(
              (f) =>
                `<button class="chip${state.filter === f ? ' on' : ''}" data-filter="${f}">${f === 'all' ? 'All' : f}</button>`
            )
            .join('')}
        </div>
        <div class="card">
          <div class="rows">
            ${list
              .map(
                (i) =>
                  `<div class="row"><div><div class="row__main">${esc(i.client)}</div><div class="row__sub">${i.id} · due ${i.due}</div></div><div class="row__right"><span class="pill pill--${i.status.toLowerCase()}">${i.status}</span><span class="amt">${money(i.amount)}</span></div></div>`
              )
              .join('')}
          </div>
        </div>`,
    };
  }

  function pageReports() {
    return {
      title: 'Reports',
      sub: 'Generated on demand',
      body: `<div class="card"><div class="rows">${D.reports
        .map(
          (r) =>
            `<div class="row"><div><div class="row__main">${esc(r.name)}</div><div class="row__sub">${esc(r.note)}</div></div><div class="row__right"><button class="btn" data-toast="${esc(r.name)} queued">Run</button></div></div>`
        )
        .join('')}</div></div>`,
    };
  }

  function pageJournal() {
    return {
      title: 'Journal',
      sub: `${D.entries.length} entries`,
      body: `<div class="card"><div class="rows">${D.entries
        .map(
          (e) =>
            `<div class="row"><div><div class="row__main">${esc(e.memo)}</div><div class="row__sub">${esc(e.account)} · ${e.date}</div></div><div class="row__right ${e.amount < 0 ? 'neg' : 'pos'}">${money(e.amount)}</div></div>`
        )
        .join('')}</div></div>`,
    };
  }

  function pageSettings() {
    return {
      title: 'Settings',
      sub: 'Workspace',
      body: `
        <div class="card pad">
          <div class="form">
            <label class="field"><span>Company</span><input value="Northwind Studio" /></label>
            <label class="field"><span>Fiscal year starts</span>
              <select><option>January</option><option>April</option></select>
            </label>
            <label class="field"><span>Base currency</span>
              <select><option>USD</option><option>EUR</option><option>ILS</option></select>
            </label>
          </div>
          <div class="actions"><button class="btn btn--primary" data-toast="Settings saved">Save</button></div>
        </div>`,
    };
  }

  // ---------------------------------------------------------------- overlays

  const OVERLAYS = {
    'new-invoice': {
      title: 'New invoice',
      sub: 'Draft',
      body: `
        <div class="form form--stack">
          <label class="field"><span>Client</span><input placeholder="Acme" /></label>
          <label class="field"><span>Amount</span><input placeholder="0.00" /></label>
          <label class="field"><span>Due date</span><input placeholder="2026-11-30" /></label>
        </div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn--primary" data-toast="Invoice drafted" data-close>Create draft</button>`,
    },
    'new-entry': {
      title: 'New entry',
      sub: 'Double-entry',
      body: `
        <div class="form form--stack">
          <label class="field"><span>Memo</span><input placeholder="What is this for?" /></label>
          <label class="field"><span>Debit</span><select><option>Cash</option><option>Revenue</option></select></label>
          <label class="field"><span>Credit</span><select><option>Revenue</option><option>Cash</option></select></label>
          <label class="field"><span>Amount</span><input placeholder="0.00" /></label>
        </div>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn--primary" data-toast="Entry posted" data-close>Post entry</button>`,
    },
  };

  function renderOverlay() {
    const spec = OVERLAYS[state.overlay];
    const host = $('overlay');
    if (!spec) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML =
      `<div class="scrim" data-close></div>` +
      `<aside class="sheet" role="dialog" aria-modal="true">` +
      `<header class="sheet__head"><div><div class="sheet__title">${esc(spec.title)}</div>` +
      `<div class="sheet__sub">${esc(spec.sub)}</div></div>` +
      `<button class="sheet__x" data-close aria-label="Close">×</button></header>` +
      `<div class="sheet__body">${spec.body}</div>` +
      `<footer class="sheet__foot">${spec.foot}</footer>` +
      `</aside>`;
  }

  // ---------------------------------------------------------------- render

  function render() {
    const [base, id] = state.path.split('/');
    const page =
      base === 'accounts'
        ? id
          ? pageAccount(id)
          : pageAccounts()
        : base === 'invoices'
          ? pageInvoices()
          : base === 'reports'
            ? pageReports()
            : base === 'journal'
              ? pageJournal()
              : base === 'settings'
                ? pageSettings()
                : pageOverview();

    $('nav').innerHTML = navHTML();
    $('title').textContent = page.title;
    $('sub').textContent = page.sub || '';
    $('actions').innerHTML = page.actions || '';
    $('content').innerHTML = page.body;
    renderOverlay();
  }

  // ---------------------------------------------------------------- events

  document.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) {
      go(goEl.dataset.go);
      return;
    }
    const overlayEl = e.target.closest('[data-overlay]');
    if (overlayEl) {
      openOverlay(overlayEl.dataset.overlay);
      return;
    }
    if (e.target.closest('[data-close]')) {
      closeOverlay();
      return;
    }
    const toastEl = e.target.closest('[data-toast]');
    if (toastEl) {
      toast(toastEl.dataset.toast);
      return;
    }
    const filterEl = e.target.closest('[data-filter]');
    if (filterEl) {
      state.filter = filterEl.dataset.filter;
      render();
    }
  });

  // Links are real hrefs, so the crawler can see them; this keeps them in-app.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="/"]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(link.getAttribute('href').replace(/^\/+/, ''));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.overlay) {
      closeOverlay();
      e.stopPropagation();
    }
  });

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2000);
  }

  // ---------------------------------------------------------------- boot

  render();
  announce();
})();
