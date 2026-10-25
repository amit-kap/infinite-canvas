// The demo app's manifest. This file is the reference for what a project
// config looks like: everything here is optional, and the canvas will crawl
// your app for screens if `screens` is missing.
export default {
  title: 'Kestrel',

  // How this app addresses a screen. Kestrel routes with a query string
  // (`/?r=cases`), so the canvas builds frame URLs the same way. Most apps use
  // paths (`/cases`) — that is the default, and then this line can go away.
  router: 'query',

  screens: [
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

    // A screen can be a route plus one open overlay. `state` names the overlay
    // the app should open on load, so the frame's URL fully describes what it
    // shows — reload it, or send it to an agent, and the drawer is still open.
    { key: 'cases', state: 'new-case', title: 'New case', group: 'Respond' },
    { key: 'alerts', state: 'suppress', title: 'Suppress alert', group: 'Respond' },
    { key: 'case/2291', state: 'escalate', title: 'Escalate case', group: 'Respond' },
    { key: 'team', state: 'invite', title: 'Invite member', group: 'Set up' },
  ],
};
