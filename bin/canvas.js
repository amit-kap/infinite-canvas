#!/usr/bin/env node
// infinite-canvas — every screen of your app on one canvas.
//
//   npx canvas --app http://localhost:3000
//   npx canvas --app ./app
//   npx canvas --demo

const fs = require('fs');
const path = require('path');

const { start } = require('../lib/server');
const { loadConfig } = require('../lib/config');

const PKG = path.join(__dirname, '..');

const HELP = `
  infinite-canvas — every screen of your app on one canvas

  Usage
    canvas --app <url|dir>     proxy a running dev server, or serve a folder
    canvas --demo              the bundled Kestrel demo app

  Options
    --app <url|dir>   what to serve at /        (default: canvas.config, or ./app)
    --port <n>        port to listen on         (default: 4173)
    --config <file>   use a specific config file
    --state <dir>     where layout and comments live (default: ./.canvas)
    --crawl           ignore config screens and crawl the app instead
    --agent-stub      answer review requests with the stub agent (on for --demo)
    --no-stub         do not start the stub agent
    --help

  The canvas lives at /__canvas/ and the app at /. One origin, no app changes:
  the channel is injected into the HTML the server serves.

  Config (optional), canvas.config.mjs:
    export default {
      app: 'http://localhost:3000',
      title: 'Kestrel',
      screens: [{ key: 'cases', state: 'new-case', title: 'New case', group: 'Respond' }],
    }
`;

function parseArgs(argv) {
  const args = { port: null, app: null, config: null, state: null, demo: false, crawl: false, stub: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--demo') args.demo = true;
    else if (arg === '--crawl') args.crawl = true;
    else if (arg === '--agent-stub' || arg === '--stub') args.stub = true;
    else if (arg === '--no-stub') args.stub = false;
    else if (arg === '--app') args.app = next();
    else if (arg === '--port' || arg === '-p') args.port = next();
    else if (arg === '--config' || arg === '-c') args.config = next();
    else if (arg === '--state') args.state = next();
    else if (arg.startsWith('--app=')) args.app = arg.slice(6);
    else if (arg.startsWith('--port=')) args.port = arg.slice(7);
    else if (arg.startsWith('--config=')) args.config = arg.slice(9);
    else if (arg.startsWith('--state=')) args.state = arg.slice(8);
    else if (!arg.startsWith('-')) args.app = arg;
    else {
      console.error(`Unknown option: ${arg}`);
      args.help = true;
    }
  }
  return args;
}

function resolveApp(spec, cwd) {
  if (!spec) return null;
  if (/^https?:\/\//i.test(spec)) {
    return { kind: 'proxy', origin: spec.replace(/\/+$/, ''), label: spec };
  }
  const dir = path.resolve(cwd, spec);
  const rel = path.relative(cwd, dir);
  return { kind: 'dir', path: dir, label: !rel || rel.startsWith('..') ? dir : rel };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(HELP);

  const cwd = process.cwd();
  const config = await loadConfig(cwd, args.config);

  let app;
  if (args.demo) {
    app = { kind: 'dir', path: path.join(PKG, 'app'), label: 'demo' };
    if (!config.screens.length) {
      const demoConfig = await loadConfig(PKG);
      config.screens = demoConfig.screens;
      config.router = demoConfig.router;
      config.title = config.title || demoConfig.title;
    }
  } else {
    app = resolveApp(args.app, cwd) || resolveApp(config.app, cwd);
  }

  if (!app) {
    const guess = path.join(cwd, 'app');
    if (fs.existsSync(guess)) app = { kind: 'dir', path: guess, label: 'app' };
  }

  if (!app) {
    console.error('\n  Nothing to show. Pass the app to review:\n');
    console.error('    canvas --app http://localhost:3000   # your dev server');
    console.error('    canvas --app ./app                   # a folder of static files');
    console.error('    canvas --demo                        # the bundled demo\n');
    process.exit(1);
  }

  if (app.kind === 'dir' && !fs.existsSync(app.path)) {
    console.error(`\n  No such folder: ${app.path}\n`);
    process.exit(1);
  }

  // --crawl overrides whatever the config says, for checking what the crawler sees.
  if (args.crawl) config.screens = [];

  const port = Number(args.port || process.env.PORT || 4173);
  const stateDir = args.state ? path.resolve(cwd, args.state) : path.join(cwd, '.canvas');
  const useStub = args.stub === null ? args.demo : args.stub;

  const { url } = await start({
    app,
    port,
    config,
    toolDir: path.join(PKG, 'public'),
    stateDir,
    onReady(url) {
      const where = app.kind === 'proxy' ? app.origin + '  (proxy)' : app.path + '  (static)';
      const screens = config.screens.length
        ? `${config.screens.length} from ${path.basename(config.file || 'config')}`
        : 'crawling the app';
      console.log('');
      console.log('  Infinite canvas  ' + url);
      console.log('  app              ' + where);
      console.log('  screens          ' + screens);
      const relState = path.relative(cwd, stateDir);
      console.log('  state            ' + (!relState || relState.startsWith('..') ? stateDir : relState) + '/');
      console.log('  agent            ' + (useStub ? 'stub — watching review.json' : 'none — write a reply to review.json'));
      console.log('');
    },
  });

  if (useStub) {
    const { startStub } = require('../lib/agent-stub');
    startStub({ stateDir, log: (message) => console.log('  agent  ' + message) });
  }

  const shutdown = () => process.exit(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return url;
}

main().catch((err) => {
  console.error('\n  ' + err.message + '\n');
  process.exit(1);
});
