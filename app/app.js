(function () {
  'use strict';

  const D = window.KESTREL_DATA;
  const ROUTES = window.KESTREL_ROUTES;

  const NAV = [
    { label: 'Monitor', items: ['overview'] },
    { label: 'Respond', items: ['cases', 'alerts'] },
    { label: 'Detect', items: ['rules'] },
    { label: 'Set up', items: ['integrations', 'team', 'settings', 'billing'] },
  ];

  const NAV_ALIAS = { case: 'cases', alert: 'alerts', rule: 'rules' };

  const ui = {
    route: readRoute(),
    state: readState(),
    caseFilter: 'all',
    alertFilter: 'open',
    caseTab: 'timeline',
    alertTab: 'payload',
    notes: D.caseNotes.map((n) => ({ ...n })),
    members: D.team.map((m) => ({ ...m })),
    integrations: D.integrations.map((i) => ({ ...i })),
    rules: D.rules.map((r) => ({ ...r })),
    settings: {
      workspace: 'Acme Security',
      timezone: 'Asia/Jerusalem',
      retention: '90 days',
      digest: true,
      autoclose: false,
      slack: true,
    },
  };

  const navEl = document.getElementById('nav');
  const topEl = document.getElementById('top');
  const contentEl = document.getElementById('content');
  const overlayEl = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');

  // ---------------------------------------------------------------- routing

  function readRoute() {
    return new URLSearchParams(location.search).get('r') || 'overview';
  }

  // A screen can be a route plus one open overlay, carried in the URL so the
  // frame is reproducible: reload it and the drawer is still open.
  function readState() {
    return new URLSearchParams(location.search).get('state') || '';
  }

  function navigate(route, replace) {
    if (!route) return;
    ui.route = route;
    ui.state = '';
    const url = '?r=' + encodeURIComponent(route);
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    render();
    post('route', { route, state: '' });
  }

  window.addEventListener('popstate', () => {
    ui.route = readRoute();
    ui.state = readState();
    render();
    post('route', { route: ui.route, state: ui.state });
  });

  function post(type, payload) {
    try {
      if (window.parent !== window) {
        window.parent.postMessage(Object.assign({ source: 'kestrel-app', type }, payload), '*');
      }
    } catch (err) {
      /* parent unavailable */
    }
  }

  // ---------------------------------------------------------------- helpers

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const pill = (text, tone = 'neutral') =>
    `<span class="pill${tone === 'neutral' ? '' : ' pill--' + tone}">${esc(text)}</span>`;

  const sevTone = (s) => ({ Critical: 'red', High: 'amber', Medium: 'blue', Low: 'neutral' }[s] || 'neutral');

  const statusTone = (s) => ({ open: 'blue', Open: 'blue', triaged: 'amber', Triaged: 'amber', closed: 'neutral', Closed: 'neutral', Paid: 'green' }[s] || 'neutral');

  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  }

  // ---------------------------------------------------------------- chrome

  function navHTML(base) {
    const active = NAV_ALIAS[base] || base;
    return NAV.map((group) => {
      const items = group.items
        .map((key) => {
          const route = ROUTES.find((r) => r.key === key);
          if (!route) return '';
          return `<button type="button" class="nav__item${key === active ? ' on' : ''}" data-nav="${key}">${esc(route.title)}</button>`;
        })
        .join('');
      return `<div><div class="nav__label">${group.label}</div>${items}</div>`;
    }).join('');
  }

  function render() {
    const parts = ui.route.split('/');
    const base = parts[0];
    const id = parts[1];
    const page = (PAGES[base] || PAGES.overview)(id);

    navEl.innerHTML = navHTML(base);
    topEl.innerHTML =
      `<div><div class="top__title">${esc(page.title)}</div>` +
      (page.sub ? `<div class="top__sub">${esc(page.sub)}</div>` : '') +
      `</div><div class="top__actions">${page.actions || ''}</div>`;
    contentEl.innerHTML = page.body;
    contentEl.scrollTop = 0;
    applyFilters();
    renderOverlay();
  }

  // ---------------------------------------------------------------- pages

  const PAGES = {
    overview() {
      const max = Math.max(...D.signals.map((s) => s.value));
      return {
        title: 'Overview',
        sub: 'Last 24 hours',
        actions:
          `<button type="button" class="btn" data-nav="alerts">Alerts</button>` +
          `<button type="button" class="btn btn--primary" data-nav="cases">Open cases</button>`,
        body: `
          <div class="kpis">
            <div class="card kpi"><div class="kpi__label">Open cases</div><div class="kpi__value">6</div><div class="kpi__delta">2 new today</div></div>
            <div class="card kpi"><div class="kpi__label">Alerts today</div><div class="kpi__value">6</div><div class="kpi__delta">3 waiting on triage</div></div>
            <div class="card kpi"><div class="kpi__label">Median time to resolve</div><div class="kpi__value">4.2h</div><div class="kpi__delta">−11% vs last week</div></div>
          </div>

          <div class="sec"><h2>Signals by source</h2><button type="button" class="sec__link" data-nav="alerts">All alerts</button></div>
          <div class="card pad">
            <div class="bars">
              ${D.signals
                .map(
                  (s) => `<div class="bar">
                    <span class="bar__label">${s.label}</span>
                    <div class="bar__track"><div class="bar__fill" style="width:${Math.round((s.value / max) * 100)}%"></div></div>
                    <span class="bar__val">${s.value}</span>
                  </div>`
                )
                .join('')}
            </div>
          </div>

          <div class="sec"><h2>Recent activity</h2><button type="button" class="sec__link" data-nav="cases">All cases</button></div>
          <div class="card">
            <table class="table"><tbody>
              ${D.activity
                .map(
                  (a) => `<tr data-nav="${a.nav}"><td><div class="cell__main">${esc(a.text)}</div><div class="cell__sub">${esc(a.meta)}</div></td></tr>`
                )
                .join('')}
            </tbody></table>
          </div>
        `,
      };
    },

    cases() {
      const counts = {
        all: D.cases.length,
        mine: D.cases.filter((c) => c.mine).length,
        breaching: D.cases.filter((c) => c.breaching).length,
      };
      return {
        title: 'Cases',
        sub: `${counts.all} open`,
        actions:
          `<button type="button" class="btn" data-act="export">Export</button>` +
          `<button type="button" class="btn btn--primary" data-nav="case/2291">New case</button>`,
        body: `
          <div class="toolbar">
            <div class="chips">
              <button type="button" class="chip${ui.caseFilter === 'all' ? ' chip--on' : ''}" data-act="caseFilter" data-value="all">All ${counts.all}</button>
              <button type="button" class="chip${ui.caseFilter === 'mine' ? ' chip--on' : ''}" data-act="caseFilter" data-value="mine">Mine ${counts.mine}</button>
              <button type="button" class="chip${ui.caseFilter === 'breaching' ? ' chip--on' : ''}" data-act="caseFilter" data-value="breaching">Breaching ${counts.breaching}</button>
            </div>
            <input class="input input--search" placeholder="Filter cases" data-filter="cases" />
          </div>

          <div class="card">
            <table class="table" id="casesTable">
              <thead><tr><th>Case</th><th>Severity</th><th>Owner</th><th>SLA</th></tr></thead>
              <tbody>
                ${D.cases
                  .map(
                    (c) => `<tr data-nav="case/${c.id.split('-')[1]}" data-row data-mine="${c.mine ? 1 : 0}" data-breaching="${c.breaching ? 1 : 0}">
                      <td><div class="cell__main">${c.id}</div><div class="cell__sub">${esc(c.title)}</div></td>
                      <td>${pill(c.severity, sevTone(c.severity))}</td>
                      <td>${esc(c.owner)}</td>
                      <td class="num">${esc(c.sla)}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      };
    },

    case(id) {
      const record = D.cases.find((c) => c.id === 'CAS-' + id) || D.cases[0];
      return {
        title: 'Case detail',
        sub: `${record.id} · ${record.source}`,
        actions:
          `<button type="button" class="btn" data-act="assign">Assign</button>` +
          `<button type="button" class="btn btn--primary" data-act="escalate">Escalate</button>`,
        body: `
          <div class="page-head">
            <div>
              <div class="page-head__title">${esc(record.title)}</div>
              <div class="page-head__meta">${record.id} · Opened ${record.opened} · ${esc(record.owner)}</div>
            </div>
            <div class="page-head__pills">${pill(record.severity, sevTone(record.severity))}${pill(record.status, statusTone(record.status))}</div>
          </div>

          <div class="grid2">
            <div>
              <div class="tabs">
                <button type="button" class="tab${ui.caseTab === 'timeline' ? ' tab--on' : ''}" data-act="caseTab" data-value="timeline">Timeline</button>
                <button type="button" class="tab${ui.caseTab === 'evidence' ? ' tab--on' : ''}" data-act="caseTab" data-value="evidence">Evidence</button>
                <button type="button" class="tab${ui.caseTab === 'notes' ? ' tab--on' : ''}" data-act="caseTab" data-value="notes">Notes<span class="count">${ui.notes.length}</span></button>
              </div>
              <div class="card pad" id="casePanel">${casePanel()}</div>
            </div>

            <div class="card pad facts">
              <div><div class="fact__k">Owner</div><div class="fact__v">${esc(record.owner)}</div></div>
              <div><div class="fact__k">SLA</div><div class="fact__v">${esc(record.sla)}</div></div>
              <div><div class="fact__k">Source</div><div class="fact__v">${esc(record.source)}</div></div>
              <div><div class="fact__k">Rule</div><div class="fact__v">R-114 · Impossible travel</div></div>
              <div class="actions">
                <button type="button" class="btn btn--sm" data-act="snooze">Snooze</button>
                <button type="button" class="btn btn--sm" data-act="close">Close case</button>
              </div>
            </div>
          </div>
        `,
      };
    },

    alerts() {
      const counts = { open: 0, triaged: 0, closed: 0 };
      D.alerts.forEach((a) => (counts[a.status] += 1));
      return {
        title: 'Alerts',
        sub: 'Today',
        actions:
          `<button type="button" class="btn" data-act="suppress">Suppress</button>` +
          `<button type="button" class="btn btn--primary" data-nav="alert/8842">Open first</button>`,
        body: `
          <div class="toolbar">
            <div class="chips">
              <button type="button" class="chip${ui.alertFilter === 'open' ? ' chip--on' : ''}" data-act="alertFilter" data-value="open">Open ${counts.open}</button>
              <button type="button" class="chip${ui.alertFilter === 'triaged' ? ' chip--on' : ''}" data-act="alertFilter" data-value="triaged">Triaged ${counts.triaged}</button>
              <button type="button" class="chip${ui.alertFilter === 'closed' ? ' chip--on' : ''}" data-act="alertFilter" data-value="closed">Closed ${counts.closed}</button>
            </div>
            <input class="input input--search" placeholder="Filter alerts" data-filter="alerts" />
          </div>

          <div class="card">
            <table class="table" id="alertsTable">
              <thead><tr><th>Alert</th><th>Rule</th><th>Source</th><th>Confidence</th><th>Received</th></tr></thead>
              <tbody>
                ${D.alerts
                  .map(
                    (a) => `<tr data-nav="alert/${a.id.split('-')[1]}" data-row data-status="${a.status}">
                      <td><div class="cell__main">${esc(a.name)}</div><div class="cell__sub">${a.id}</div></td>
                      <td class="num">${a.rule}</td>
                      <td>${esc(a.source)}</td>
                      <td class="num">${a.confidence}%</td>
                      <td class="num">${a.received}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      };
    },

    alert(id) {
      const record = D.alerts.find((a) => a.id === 'ALT-' + id) || D.alerts[0];
      return {
        title: 'Alert detail',
        sub: `${record.id} · ${record.source}`,
        actions:
          `<button type="button" class="btn" data-act="suppress">Suppress</button>` +
          `<button type="button" class="btn btn--primary" data-act="createCase">Create case</button>`,
        body: `
          <div class="page-head">
            <div>
              <div class="page-head__title">${esc(record.name)}</div>
              <div class="page-head__meta">${record.id} · Rule ${record.rule} · Received ${record.received}</div>
            </div>
            <div class="page-head__pills">${pill('Open', 'blue')}${pill(record.confidence + '% confidence', 'neutral')}</div>
          </div>

          <div class="grid2">
            <div>
              <div class="tabs">
                <button type="button" class="tab${ui.alertTab === 'payload' ? ' tab--on' : ''}" data-act="alertTab" data-value="payload">Payload</button>
                <button type="button" class="tab${ui.alertTab === 'context' ? ' tab--on' : ''}" data-act="alertTab" data-value="context">Context</button>
              </div>
              <div class="card pad" id="alertPanel">${alertPanel()}</div>
            </div>

            <div class="card pad facts">
              <div><div class="fact__k">Rule</div><div class="fact__v">${record.rule} · Impossible travel</div></div>
              <div><div class="fact__k">Source</div><div class="fact__v">${esc(record.source)}</div></div>
              <div><div class="fact__k">Confidence</div><div class="fact__v">${record.confidence}%</div></div>
              <div><div class="fact__k">Received</div><div class="fact__v">${record.received} today</div></div>
              <div class="actions">
                <button type="button" class="btn btn--sm" data-act="assign">Assign to me</button>
              </div>
            </div>
          </div>
        `,
      };
    },

    rules() {
      const enabled = ui.rules.filter((r) => r.enabled).length;
      return {
        title: 'Rules',
        sub: `${ui.rules.length} rules · ${enabled} enabled`,
        actions: `<button type="button" class="btn btn--primary" data-nav="rule/114">New rule</button>`,
        body: `
          <div class="card">
            <table class="table" id="rulesTable">
              <thead><tr><th>Rule</th><th>Source</th><th>Severity</th><th>Enabled</th></tr></thead>
              <tbody>
                ${ui.rules
                  .map(
                    (r) => `<tr data-nav="rule/${r.id.split('-')[1]}">
                      <td><div class="cell__main">${esc(r.name)}</div><div class="cell__sub">${r.id}</div></td>
                      <td>${esc(r.source)}</td>
                      <td>${pill(r.severity, sevTone(r.severity))}</td>
                      <td><button type="button" class="switch" role="switch" aria-checked="${r.enabled}" aria-label="Toggle ${esc(r.name)}" data-act="toggleRule" data-id="${r.id}"></button></td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      };
    },

    rule(id) {
      const record = ui.rules.find((r) => r.id === 'R-' + id) || ui.rules[0];
      return {
        title: 'Rule editor',
        sub: `${record.id} · Draft`,
        actions: `<button type="button" class="btn" data-act="testRule">Test</button><button type="button" class="btn btn--primary" data-act="saveRule">Save rule</button>`,
        body: `
          <div class="grid2">
            <div class="card pad">
              <div class="form">
                <div class="form__row"><div class="form__label">Name</div><input class="input" id="ruleName" value="${esc(record.name)}" /></div>
                <div class="form__row"><div class="form__label">Source</div>
                  <select class="input" id="ruleSource">
                    ${['Identity', 'Cloud', 'Endpoint', 'Email'].map((s) => `<option${s === record.source ? ' selected' : ''}>${s}</option>`).join('')}
                  </select>
                </div>
                <div class="form__row"><div class="form__label">Severity</div>
                  <select class="input" id="ruleSeverity">
                    ${['Critical', 'High', 'Medium', 'Low'].map((s) => `<option${s === record.severity ? ' selected' : ''}>${s}</option>`).join('')}
                  </select>
                </div>
                <div class="form__row"><div class="form__label">Owner</div><input class="input" value="Dana Levi" /></div>
                <div class="form__row form__row--wide"><div class="form__label">Expression</div>
                  <textarea class="input mono" id="ruleExpression" rows="3">${esc(record.expression)}</textarea>
                </div>
              </div>
              <div class="test-result" id="testResult"></div>
              <div class="actions">
                <button type="button" class="btn" data-act="testRule">Test against last 24h</button>
                <button type="button" class="btn btn--primary" data-act="saveRule">Save rule</button>
              </div>
            </div>

            <div class="card pad facts">
              <div><div class="fact__k">Status</div><div class="fact__v">Draft — not running</div></div>
              <div><div class="fact__k">Last fired</div><div class="fact__v">Never</div></div>
              <div><div class="fact__k">Matches 24h</div><div class="fact__v">—</div></div>
              <div><div class="fact__k">Created</div><div class="fact__v">Sep 14, 2026</div></div>
            </div>
          </div>
        `,
      };
    },

    integrations() {
      const connected = ui.integrations.filter((i) => i.connected).length;
      return {
        title: 'Integrations',
        sub: `${connected} of ${ui.integrations.length} connected`,
        actions: `<button type="button" class="btn btn--primary" data-act="browse">Browse catalog</button>`,
        body: `
          <div class="card">
            <div class="rows">
              ${ui.integrations
                .map(
                  (i) => `<div class="row">
                    <div class="avatar">${i.name.slice(0, 2)}</div>
                    <div><div class="row__main">${esc(i.name)}</div><div class="row__sub">${esc(i.detail)}${i.connected && i.lastSync ? ' · synced ' + i.lastSync : ''}</div></div>
                    <div class="row__right">
                      ${pill(i.connected ? 'Connected' : 'Not connected', i.connected ? 'green' : 'neutral')}
                      <button type="button" class="btn btn--sm" data-act="toggleIntegration" data-name="${esc(i.name)}">${i.connected ? 'Disconnect' : 'Connect'}</button>
                    </div>
                  </div>`
                )
                .join('')}
            </div>
          </div>
        `,
      };
    },

    team() {
      return {
        title: 'Team',
        sub: `${ui.members.length} members`,
        actions: `<button type="button" class="btn btn--primary" data-act="invite">Invite</button>`,
        body: `
          <div class="card pad invite">
            <div class="form">
              <div class="form__row"><div class="form__label">Email</div><input class="input" id="inviteEmail" placeholder="name@acme.io" /></div>
              <div class="form__row"><div class="form__label">Role</div>
                <select class="input" id="inviteRole"><option>Analyst</option><option>Responder</option><option>Admin</option><option>Viewer</option></select>
              </div>
            </div>
            <div class="actions"><button type="button" class="btn btn--primary" data-act="invite">Send invite</button></div>
          </div>

          <div class="card mt-14">
            <table class="table">
              <thead><tr><th>Member</th><th>Role</th><th>Cases</th><th>Last active</th></tr></thead>
              <tbody>
                ${ui.members
                  .map(
                    (m) => `<tr>
                      <td><div class="member"><div class="avatar">${esc(m.initials)}</div><div>${esc(m.name)}</div></div></td>
                      <td>${esc(m.role)}</td>
                      <td class="num">${m.cases}</td>
                      <td class="num">${esc(m.active)}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      };
    },

    settings() {
      return {
        title: 'Settings',
        sub: 'Workspace',
        actions: `<button type="button" class="btn btn--primary" data-act="saveSettings">Save changes</button>`,
        body: `
          <div class="grid2">
            <div class="card pad">
              <div class="form">
                <div class="form__row"><div class="form__label">Workspace name</div><input class="input" id="setWorkspace" value="${esc(ui.settings.workspace)}" /></div>
                <div class="form__row"><div class="form__label">Timezone</div>
                  <select class="input" id="setTimezone">
                    ${['Asia/Jerusalem', 'Europe/London', 'America/New_York', 'UTC'].map((z) => `<option${z === ui.settings.timezone ? ' selected' : ''}>${z}</option>`).join('')}
                  </select>
                </div>
                <div class="form__row"><div class="form__label">Data retention</div>
                  <select class="input" id="setRetention">
                    ${['30 days', '90 days', '180 days', '1 year'].map((r) => `<option${r === ui.settings.retention ? ' selected' : ''}>${r}</option>`).join('')}
                  </select>
                </div>
                <div class="form__row"><div class="form__label">Workspace ID</div><input class="input" value="ws_acme_9f21" disabled /></div>
              </div>
              <div class="actions"><button type="button" class="btn btn--primary" data-act="saveSettings">Save changes</button></div>
            </div>

            <div class="card">
              <div class="rows">
                <div class="row"><div><div class="row__main">Weekly digest</div><div class="row__sub">Monday, 09:00</div></div>
                  <div class="row__right"><button type="button" class="switch" role="switch" aria-checked="${ui.settings.digest}" data-act="toggleSetting" data-key="digest"></button></div></div>
                <div class="row"><div><div class="row__main">Auto-close stale cases</div><div class="row__sub">After 14 days</div></div>
                  <div class="row__right"><button type="button" class="switch" role="switch" aria-checked="${ui.settings.autoclose}" data-act="toggleSetting" data-key="autoclose"></button></div></div>
                <div class="row"><div><div class="row__main">Slack notifications</div><div class="row__sub">#security-ops</div></div>
                  <div class="row__right"><button type="button" class="switch" role="switch" aria-checked="${ui.settings.slack}" data-act="toggleSetting" data-key="slack"></button></div></div>
              </div>
            </div>
          </div>
        `,
      };
    },

    billing() {
      return {
        title: 'Billing',
        sub: 'Team plan',
        actions: `<button type="button" class="btn btn--primary" data-act="managePlan">Manage plan</button>`,
        body: `
          <div class="grid2">
            <div class="card pad">
              <div class="fact__k">Current plan</div>
              <div class="plan">Team</div>
              <div class="row__sub">$120 per seat, billed monthly</div>
              <div class="seats">
                <div class="seats__head"><span>Seats</span><span class="num">9 of 12</span></div>
                <div class="bar__track"><div class="bar__fill" style="width:75%"></div></div>
              </div>
              <div class="actions">
                <button type="button" class="btn" data-act="managePlan">Change plan</button>
                <button type="button" class="btn" data-act="addSeats">Add seats</button>
              </div>
            </div>

            <div class="card pad facts">
              <div><div class="fact__k">Next invoice</div><div class="fact__v">Nov 1, 2026 · $1,080</div></div>
              <div><div class="fact__k">Payment method</div><div class="fact__v">Visa ···· 4242</div></div>
              <div><div class="fact__k">Billing email</div><div class="fact__v">finance@acme.io</div></div>
            </div>
          </div>

          <div class="sec"><h2>Invoices</h2></div>
          <div class="card">
            <table class="table">
              <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                ${D.invoices
                  .map(
                    (i) => `<tr data-nav="billing"><td class="num">${i.id}</td><td>${i.date}</td><td class="num">${i.amount}</td><td>${pill(i.status, 'green')}</td></tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      };
    },

    onboarding() {
      return {
        title: 'First run',
        sub: 'New workspace',
        actions: '',
        body: `
          <div class="card empty">
            <h2>Connect your first source</h2>
            <p>Kestrel is only as good as its signals.</p>
            <div class="steps">
              <div class="step"><div class="step__n">1</div><div><div class="step__text">Connect an identity provider</div><div class="step__meta">Okta, Entra ID, Google</div></div></div>
              <div class="step"><div class="step__n">2</div><div><div class="step__text">Pick a detection pack</div><div class="step__meta">12 rules, tuned for small teams</div></div></div>
              <div class="step"><div class="step__n">3</div><div><div class="step__text">Invite your responders</div><div class="step__meta">They get a daily digest</div></div></div>
            </div>
            <div class="actions">
              <button type="button" class="btn btn--primary" data-nav="integrations">Connect Okta</button>
              <button type="button" class="btn" data-nav="overview">Skip for now</button>
            </div>
          </div>
        `,
      };
    },
  };

  // ---------------------------------------------------------------- panels

  function casePanel() {
    if (ui.caseTab === 'evidence') {
      return `<div class="facts">
        ${D.caseEvidence
          .map((e) => `<div><div class="fact__k">${esc(e.label)}</div><div class="fact__v">${esc(e.value)}</div></div>`)
          .join('')}
      </div>`;
    }
    if (ui.caseTab === 'notes') {
      return `<div id="noteList">
          ${ui.notes
            .map(
              (n) => `<div class="note"><div class="note__head"><span class="note__author">${esc(n.author)}</span><span>${esc(n.time)}</span></div><div class="note__text">${esc(n.text)}</div></div>`
            )
            .join('')}
        </div>
        <div class="composer">
          <input class="input" id="noteInput" placeholder="Add a note" />
          <button type="button" class="btn btn--primary" data-act="addNote">Add note</button>
        </div>`;
    }
    return `<div class="timeline">
      ${D.caseTimeline
        .map(
          (t) => `<div class="tl"><div class="tl__time">${esc(t.time)}</div><div class="tl__body"><div class="tl__text">${esc(t.text)}</div><div class="tl__meta">${esc(t.meta)}</div></div></div>`
        )
        .join('')}
    </div>`;
  }

  function alertPanel() {
    if (ui.alertTab === 'context') {
      return `<div class="facts">
        <div><div class="fact__k">Actor</div><div class="fact__v">dana.levi@acme.io</div></div>
        <div><div class="fact__k">From</div><div class="fact__v">Tel Aviv · 08:44 · hardware key</div></div>
        <div><div class="fact__k">To</div><div class="fact__v">San Francisco · 09:02 · password only</div></div>
        <div><div class="fact__k">Related case</div><div class="fact__v">CAS-2291</div></div>
      </div>`;
    }
    return `<pre class="code">${esc(D.alertPayload.join('\n'))}</pre>`;
  }

  // ---------------------------------------------------------------- overlays

  // A screen can be a route plus one open overlay. The overlay lives in the
  // URL (?r=cases&state=new-case), so a frame that shows it is reproducible:
  // the canvas just loads that URL, and reloading keeps the drawer open.
  const OVERLAYS = {
    'new-case': {
      route: 'cases',
      title: 'New case',
      sub: 'Without an alert',
      body: `
        <div class="form">
          <div class="form__row form__row--wide"><div class="form__label">Title</div><input class="input" placeholder="What happened?" /></div>
          <div class="form__row"><div class="form__label">Severity</div>
            <select class="input">${['Critical', 'High', 'Medium', 'Low'].map((s) => `<option${s === 'High' ? ' selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="form__row"><div class="form__label">Owner</div>
            <select class="input">${['Dana Levi', 'Omer Bar', 'Noa Katz'].map((s) => `<option>${s}</option>`).join('')}</select>
          </div>
          <div class="form__row form__row--wide"><div class="form__label">Description</div>
            <textarea class="input" rows="4" placeholder="Context for whoever picks this up"></textarea>
          </div>
        </div>
        <p class="sheet__note">Cases open as <b>Open</b> and start the 4 hour SLA clock.</p>`,
      foot: `<button type="button" class="btn" data-act="closeOverlay">Cancel</button>
             <button type="button" class="btn btn--primary" data-act="confirmOverlay" data-msg="Case created">Create case</button>`,
    },

    suppress: {
      route: 'alerts',
      title: 'Suppress alert',
      sub: 'ALT-8842 · Impossible travel',
      body: `
        <div class="form">
          <div class="form__row form__row--wide"><div class="form__label">Scope</div>
            <select class="input">
              <option>This rule, for this actor</option>
              <option>This rule, everyone</option>
              <option>All rules, this actor</option>
            </select>
          </div>
          <div class="form__row form__row--wide"><div class="form__label">For</div>
            <select class="input"><option>4 hours</option><option>24 hours</option><option>Indefinitely</option></select>
          </div>
          <div class="form__row form__row--wide"><div class="form__label">Reason</div>
            <textarea class="input" rows="3" placeholder="Why is this safe to ignore?"></textarea>
          </div>
        </div>
        <div class="sheet__warn">Suppressed alerts leave the queue and will not open a case. The rule keeps firing silently.</div>`,
      foot: `<button type="button" class="btn" data-act="closeOverlay">Cancel</button>
             <button type="button" class="btn btn--primary" data-act="confirmOverlay" data-msg="Suppression drafted">Suppress alert</button>`,
    },

    escalate: {
      route: 'case/2291',
      title: 'Escalate case',
      sub: 'CAS-2291 · Impossible travel',
      body: `
        <div class="form">
          <div class="form__row form__row--wide"><div class="form__label">Escalate to</div>
            <select class="input">
              <option>Tier 2 — Responders</option>
              <option>Tier 3 — Security engineering</option>
              <option>Incident response</option>
            </select>
          </div>
          <div class="form__row form__row--wide"><div class="form__label">Reason</div>
            <textarea class="input" rows="3" placeholder="What have you ruled out?"></textarea>
          </div>
          <div class="sheet__row">
            <div>
              <div class="sheet__rowtitle">Notify the on-call responder</div>
              <div class="sheet__rowsub">Sends a page, not a digest</div>
            </div>
            <button type="button" class="switch" role="switch" aria-checked="true" data-act="toggleSwitch"></button>
          </div>
        </div>`,
      foot: `<button type="button" class="btn" data-act="closeOverlay">Cancel</button>
             <button type="button" class="btn btn--primary" data-act="confirmOverlay" data-msg="Escalated to Tier 2">Escalate</button>`,
    },

    invite: {
      route: 'team',
      title: 'Invite member',
      sub: '9 of 12 seats used',
      body: `
        <div class="form">
          <div class="form__row form__row--wide"><div class="form__label">Email</div><input class="input" placeholder="name@acme.io" /></div>
          <div class="form__row form__row--wide"><div class="form__label">Role</div>
            <select class="input"><option>Analyst</option><option>Responder</option><option>Admin</option></select>
          </div>
        </div>
        <p class="sheet__note">Invitees get a daily digest until they open the app.</p>`,
      foot: `<button type="button" class="btn" data-act="closeOverlay">Cancel</button>
             <button type="button" class="btn btn--primary" data-act="confirmOverlay" data-msg="Invite sent">Send invite</button>`,
    },
  };

  function renderOverlay() {
    const spec = OVERLAYS[ui.state];
    if (!spec || spec.route !== ui.route) {
      overlayEl.innerHTML = '';
      return;
    }
    overlayEl.innerHTML =
      `<div class="scrim" data-act="closeOverlay"></div>` +
      `<aside class="sheet" role="dialog" aria-modal="true" aria-label="${esc(spec.title)}">` +
      `<div class="sheet__head">` +
      `<div><div class="sheet__title">${esc(spec.title)}</div><div class="sheet__sub">${esc(spec.sub)}</div></div>` +
      `<button type="button" class="sheet__x" data-act="closeOverlay" aria-label="Close">×</button>` +
      `</div>` +
      `<div class="sheet__body">${spec.body}</div>` +
      `<div class="sheet__foot">${spec.foot}</div>` +
      `</aside>`;
  }

  function closeOverlay() {
    if (!ui.state) return;
    ui.state = '';
    history.replaceState(null, '', '?r=' + encodeURIComponent(ui.route));
    renderOverlay();
    post('state', { state: '' });
  }

  // ---------------------------------------------------------------- actions

  function act(name, el) {
    switch (name) {
      case 'caseFilter':
        ui.caseFilter = el.dataset.value;
        el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--on', c === el));
        applyFilters();
        break;
      case 'alertFilter':
        ui.alertFilter = el.dataset.value;
        el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chip--on', c === el));
        applyFilters();
        break;
      case 'caseTab':
        ui.caseTab = el.dataset.value;
        render();
        break;
      case 'alertTab':
        ui.alertTab = el.dataset.value;
        render();
        break;
      case 'addNote': {
        const input = document.getElementById('noteInput');
        const text = (input && input.value || '').trim();
        if (!text) return;
        const now = new Date();
        const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        ui.notes.push({ author: 'Dana Levi', time, text });
        render();
        const panel = document.getElementById('noteInput');
        if (panel) panel.focus();
        toast('Note added');
        break;
      }
      case 'toggleRule': {
        const rule = ui.rules.find((r) => r.id === el.dataset.id);
        if (!rule) return;
        rule.enabled = !rule.enabled;
        el.setAttribute('aria-checked', String(rule.enabled));
        toast(`${rule.id} ${rule.enabled ? 'enabled' : 'disabled'}`);
        break;
      }
      case 'saveRule':
        toast('Rule saved');
        navigate('rules');
        break;
      case 'testRule': {
        const out = document.getElementById('testResult');
        if (out) out.textContent = 'Matched 3 events in the last 24 hours · 1 would have opened a case';
        break;
      }
      case 'toggleIntegration': {
        const item = ui.integrations.find((i) => i.name === el.dataset.name);
        if (!item) return;
        item.connected = !item.connected;
        item.lastSync = item.connected ? 'just now' : null;
        toast(`${item.name} ${item.connected ? 'connected' : 'disconnected'}`);
        render();
        break;
      }
      case 'invite': {
        const input = document.getElementById('inviteEmail');
        const role = document.getElementById('inviteRole');
        const email = (input && input.value || '').trim();
        if (!email) {
          toast('Enter an email first');
          return;
        }
        const name = email.split('@')[0].replace(/[._]/g, ' ');
        const initials = name
          .split(' ')
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        ui.members.push({ name, initials, role: role ? role.value : 'Analyst', cases: 0, active: 'Invited' });
        toast(`Invite sent to ${email}`);
        render();
        break;
      }
      case 'toggleSetting': {
        const key = el.dataset.key;
        ui.settings[key] = !ui.settings[key];
        el.setAttribute('aria-checked', String(ui.settings[key]));
        break;
      }
      case 'saveSettings': {
        const ws = document.getElementById('setWorkspace');
        if (ws) ui.settings.workspace = ws.value;
        toast('Settings saved');
        break;
      }
      case 'escalate':
        toast('Escalated to Tier 2');
        break;
      case 'assign':
        toast('Assigned to Dana Levi');
        break;
      case 'createCase':
        navigate('case/2291');
        toast('Case created from alert');
        break;
      case 'snooze':
        toast('Snoozed for 4 hours');
        break;
      case 'close':
        toast('Case closed');
        break;
      case 'export':
        toast('Export queued');
        break;
      case 'suppress':
        toast('Suppression rule drafted');
        break;
      case 'browse':
        toast('Catalog opened');
        break;
      case 'managePlan':
        toast('Opening plan management');
        break;
      case 'addSeats':
        toast('3 seats added');
        break;
      case 'closeOverlay':
        closeOverlay();
        break;
      case 'confirmOverlay':
        toast(el.dataset.msg || 'Done');
        closeOverlay();
        break;
      case 'toggleSwitch':
        el.setAttribute('aria-checked', el.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- filters

  function applyFilters() {
    const caseTable = document.getElementById('casesTable');
    if (caseTable) {
      const query = (document.querySelector('[data-filter="cases"]') || {}).value || '';
      caseTable.querySelectorAll('tbody tr').forEach((row) => {
        let show = true;
        if (ui.caseFilter === 'mine') show = row.dataset.mine === '1';
        if (ui.caseFilter === 'breaching') show = row.dataset.breaching === '1';
        if (show && query) show = row.textContent.toLowerCase().includes(query.toLowerCase());
        row.hidden = !show;
      });
    }

    const alertTable = document.getElementById('alertsTable');
    if (alertTable) {
      const query = (document.querySelector('[data-filter="alerts"]') || {}).value || '';
      alertTable.querySelectorAll('tbody tr').forEach((row) => {
        let show = row.dataset.status === ui.alertFilter;
        if (show && query) show = row.textContent.toLowerCase().includes(query.toLowerCase());
        row.hidden = !show;
      });
    }
  }

  // ---------------------------------------------------------------- events

  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-act]');
    if (actionEl) {
      e.preventDefault();
      act(actionEl.dataset.act, actionEl);
      return;
    }
    const navTarget = e.target.closest('[data-nav]');
    if (navTarget) {
      e.preventDefault();
      navigate(navTarget.dataset.nav);
    }
  });

  contentEl.addEventListener('input', (e) => {
    if (e.target.matches('[data-filter]')) applyFilters();
  });

  // Forward the gestures the canvas needs while the pointer is over a screen.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.state) {
      closeOverlay();
      return;
    }
    if (e.key === 'Escape') post('key', { key: 'Escape', down: true });
    if (e.code === 'Space' && !e.repeat && !isField(e.target)) {
      e.preventDefault();
      post('key', { key: ' ', down: true });
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') post('key', { key: ' ', down: false });
  });

  // A wheel over an iframe never reaches the canvas, which used to freeze zoom
  // the moment the pointer was over a screen. Hand ⌘/Ctrl-wheel to the parent.
  document.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      post('wheel', {
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        x: e.clientX,
        y: e.clientY,
      });
    },
    { passive: false }
  );

  function isField(el) {
    return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  // ---------------------------------------------------------------- boot

  render();
  post('ready', { route: ui.route, state: ui.state });
})();
