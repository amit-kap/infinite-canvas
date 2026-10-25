#!/usr/bin/env node
// Watches .canvas/review.json and answers requests, as a real agent would.
// Point a real agent at the same file and this script becomes unnecessary.

const path = require('path');
const { startStub } = require('../lib/agent-stub');

const args = process.argv.slice(2);
const stateIdx = args.indexOf('--state');
const stateDir = stateIdx >= 0 ? path.resolve(process.cwd(), args[stateIdx + 1]) : path.join(process.cwd(), '.canvas');

console.log(`  agent stub watching ${path.relative(process.cwd(), stateDir)}/review.json`);
console.log('  (a real agent would read the same file)\n');

const stub = startStub({
  stateDir,
  log: (message) => console.log('  ' + message),
});

const stop = () => {
  stub.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
