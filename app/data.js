// The demo app's screen manifest and mock data.
// The canvas tool reads KESTREL_ROUTES to know what screens exist.

window.KESTREL_ROUTES = [
  { key: 'overview', title: 'Overview', group: 'Monitor' },
  { key: 'cases', title: 'Cases', group: 'Respond' },
  { key: 'case/2291', title: 'Case detail', group: 'Respond' },
  { key: 'alerts', title: 'Alerts', group: 'Respond' },
  { key: 'alert/8842', title: 'Alert detail', group: 'Respond' },
  { key: 'rules', title: 'Rules', group: 'Detect' },
  { key: 'rule/114', title: 'Rule editor', group: 'Detect' },
  { key: 'integrations', title: 'Integrations', group: 'Set up' },
  { key: 'team', title: 'Team', group: 'Set up' },
  { key: 'settings', title: 'Settings', group: 'Set up' },
  { key: 'billing', title: 'Billing', group: 'Set up' },
  { key: 'onboarding', title: 'First run', group: 'Set up' },

  // Screens that are a route *plus* an open overlay. `state` names the overlay
  // the app should open on load, so the frame's URL fully describes what it
  // shows — reload it, or send it to an agent, and the drawer is still there.
  { key: 'cases', state: 'new-case', title: 'New case', group: 'Respond' },
  { key: 'alerts', state: 'suppress', title: 'Suppress alert', group: 'Respond' },
  { key: 'case/2291', state: 'escalate', title: 'Escalate case', group: 'Respond' },
  { key: 'team', state: 'invite', title: 'Invite member', group: 'Set up' },
];

window.KESTREL_DATA = {
  cases: [
    { id: 'CAS-2291', title: 'Impossible travel — Dana Levi', severity: 'High', owner: 'Dana Levi', sla: '3h left', status: 'Open', source: 'Okta', opened: '2h ago', mine: true, breaching: false },
    { id: 'CAS-2288', title: 'Public S3 bucket — acme-reports', severity: 'Critical', owner: 'Omer Bar', sla: 'Breached', status: 'Open', source: 'AWS', opened: '5h ago', mine: false, breaching: true },
    { id: 'CAS-2284', title: 'Cobalt Strike beacon on mac-114', severity: 'Critical', owner: 'Noa Katz', sla: '5h left', status: 'Open', source: 'CrowdStrike', opened: '6h ago', mine: false, breaching: true },
    { id: 'CAS-2279', title: 'Invoice lure delivered to 12 inboxes', severity: 'Medium', owner: 'Dana Levi', sla: '1d left', status: 'Triaged', source: 'Google', opened: '1d ago', mine: true, breaching: false },
    { id: 'CAS-2271', title: 'Credential dump attempt on vpn-gw', severity: 'High', owner: 'Omer Bar', sla: '2d left', status: 'Triaged', source: 'Okta', opened: '2d ago', mine: false, breaching: false },
    { id: 'CAS-2266', title: 'Unusual admin role assignment', severity: 'Low', owner: 'Noa Katz', sla: '3d left', status: 'Closed', source: 'AWS', opened: '3d ago', mine: false, breaching: false },
  ],

  caseTimeline: [
    { time: '09:12', text: 'Escalated from identity rule R-114', meta: 'Dana Levi' },
    { time: '09:04', text: 'Second impossible-travel signal', meta: 'Okta · San Francisco' },
    { time: '08:47', text: 'Case opened by rule R-114', meta: 'Automation' },
    { time: '08:46', text: 'Alert ALT-8842 received', meta: 'Okta · Tel Aviv' },
  ],

  caseEvidence: [
    { label: 'Sign-in 1', value: 'Tel Aviv · 08:44 · hardware key' },
    { label: 'Sign-in 2', value: 'San Francisco · 09:02 · password only' },
    { label: 'Distance', value: '11,940 km in 18 minutes' },
    { label: 'Device', value: 'MacBook Pro · managed · healthy' },
  ],

  alerts: [
    { id: 'ALT-8842', name: 'Impossible travel', rule: 'R-114', source: 'Okta', confidence: 94, status: 'open', received: '08:46' },
    { id: 'ALT-8841', name: 'Public bucket policy changed', rule: 'R-102', source: 'AWS', confidence: 88, status: 'open', received: '08:31' },
    { id: 'ALT-8838', name: 'Beacon signature match', rule: 'R-087', source: 'CrowdStrike', confidence: 97, status: 'open', received: '07:58' },
    { id: 'ALT-8836', name: 'Bulk email with invoice lure', rule: 'R-121', source: 'Google', confidence: 76, status: 'triaged', received: '07:12' },
    { id: 'ALT-8831', name: 'MFA fatigue pattern', rule: 'R-109', source: 'Okta', confidence: 81, status: 'triaged', received: '06:40' },
    { id: 'ALT-8824', name: 'Root login without MFA', rule: 'R-102', source: 'AWS', confidence: 99, status: 'closed', received: '05:22' },
  ],

  alertPayload: [
    '{',
    '  "alert": "ALT-8842",',
    '  "rule": "R-114",',
    '  "source": "okta",',
    '  "actor": "dana.levi@acme.io",',
    '  "geo": { "from": "TLV", "to": "SFO", "km": 11940 },',
    '  "minutes": 18,',
    '  "mfa": "password"',
    '}',
  ],

  rules: [
    { id: 'R-114', name: 'Impossible travel', source: 'Identity', severity: 'High', enabled: true, expression: 'geo_velocity(user) > 800km/h AND mfa != "hardware"' },
    { id: 'R-102', name: 'Cloud policy drift', source: 'Cloud', severity: 'Critical', enabled: true, expression: 'policy_change.bucket_public == true' },
    { id: 'R-087', name: 'Beacon signature', source: 'Endpoint', severity: 'Critical', enabled: true, expression: 'process.beacon_score > 0.8' },
    { id: 'R-121', name: 'Invoice lure', source: 'Email', severity: 'Medium', enabled: true, expression: 'attachment.pdf AND subject ~ "invoice"' },
    { id: 'R-109', name: 'MFA fatigue', source: 'Identity', severity: 'High', enabled: false, expression: 'mfa_denials(user) > 5 IN 10m' },
    { id: 'R-131', name: 'Stale admin key', source: 'Cloud', severity: 'Low', enabled: false, expression: 'key.age > 90d' },
  ],

  integrations: [
    { name: 'Okta', detail: 'Identity · 4,218 users', connected: true, lastSync: '2m ago' },
    { name: 'AWS CloudTrail', detail: 'Cloud · 12 accounts', connected: true, lastSync: '5m ago' },
    { name: 'CrowdStrike', detail: 'Endpoint · 1,942 hosts', connected: true, lastSync: '12m ago' },
    { name: 'Google Workspace', detail: 'Email · 4,201 mailboxes', connected: true, lastSync: '1h ago' },
    { name: 'Slack', detail: 'Notifications', connected: true, lastSync: 'just now' },
    { name: 'Jira', detail: 'Tickets', connected: false, lastSync: null },
  ],

  team: [
    { name: 'Dana Levi', initials: 'DL', role: 'Analyst', cases: 12, active: '4m ago' },
    { name: 'Omer Bar', initials: 'OB', role: 'Responder', cases: 9, active: '22m ago' },
    { name: 'Noa Katz', initials: 'NK', role: 'Responder', cases: 7, active: '1h ago' },
    { name: 'Yael Mor', initials: 'YM', role: 'Admin', cases: 0, active: '2h ago' },
    { name: 'Tom Ben-Ami', initials: 'TB', role: 'Viewer', cases: 0, active: '3d ago' },
  ],

  invoices: [
    { id: 'INV-204', date: 'Sep 2026', amount: '$1,440', status: 'Paid' },
    { id: 'INV-203', date: 'Aug 2026', amount: '$1,440', status: 'Paid' },
    { id: 'INV-202', date: 'Jul 2026', amount: '$1,080', status: 'Paid' },
    { id: 'INV-201', date: 'Jun 2026', amount: '$1,080', status: 'Paid' },
  ],

  activity: [
    { text: 'Impossible travel escalated', meta: 'CAS-2291 · 2h ago', nav: 'case/2291' },
    { text: 'Public bucket detected in acme-reports', meta: 'CAS-2288 · 5h ago', nav: 'case/2288' },
    { text: 'Beacon quarantined on mac-114', meta: 'CAS-2284 · 6h ago', nav: 'case/2284' },
    { text: 'Invoice lure delivered to 12 inboxes', meta: 'CAS-2279 · 1d ago', nav: 'case/2279' },
  ],

  signals: [
    { label: 'Endpoint', value: 68 },
    { label: 'Identity', value: 44 },
    { label: 'Cloud', value: 31 },
    { label: 'Email', value: 12 },
  ],

  caseNotes: [
    { author: 'Dana Levi', time: '09:20', text: 'Called the user — travelling, says the SFO sign-in was not them.' },
    { author: 'Dana Levi', time: '09:24', text: 'Sessions revoked. Waiting on hardware key re-enrolment.' },
  ],
};
