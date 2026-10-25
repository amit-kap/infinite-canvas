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

    // States of one screen: the same route, different reality. These are not
    // variants of the design — they are what the screen actually is before data
    // arrives, when it is empty, and when the request fails. They sit beside the
    // real thing so a review can start from "what does this look like when…".
    { key: 'cases', state: 'empty', title: 'Cases — empty', group: 'States' },
    { key: 'cases', state: 'loading', title: 'Cases — loading', group: 'States' },
    { key: 'cases', state: 'error', title: 'Cases — error', group: 'States' },
    { key: 'overview', state: 'empty', title: 'Overview — first run', group: 'States' },

    // The middle and end of the flow below. They are ordinary screens — one
    // route, one state — which is why the flow only needs to name them.
    { key: 'cases', state: 'new-case-invalid', title: 'New case — invalid', group: 'Flow' },
    { key: 'cases', state: 'created', title: 'Case created', group: 'Flow' },
  ],

  // A flow is an ordered path through one screen, not a set of siblings. Same
  // route every step, different state — the thing a screenshot of the finished
  // screen can never show. The canvas draws the path between the frames.
  flow: [
    {
      title: 'New case',
      steps: [
        { id: 'cases', label: 'open' },
        { id: 'cases~new-case', label: 'click "New case"' },
        { id: 'cases~new-case-invalid', label: 'submit empty' },
        { id: 'cases~created', label: 'submit valid' },
      ],
    },
  ],
};
