// A stand-in for the real thing.
//
// The canvas posts a review request to .canvas/review.json and polls it for a
// reply. A real agent — a process, an MCP tool, a person with an editor — does
// exactly what this file does: read the request, write a reply. Nothing here is
// privileged; replace it and the flow is unchanged.
//
//   node bin/agent-stub.js [--state .canvas]

const fs = require('fs');
const path = require('path');

// Generic on purpose: a stub cannot know your product, so it says things that
// are worth checking on any screen, deterministically per screen id.
const POOL = [
  (s) => `${s.title}: the primary action carries the same weight as everything else — it's not obvious what to do first.`,
  (s) => `No empty state for ${s.title}. What does this look like before any data exists?`,
  (s) => `${s.title} assumes the request succeeds: no loading state, no error state.`,
  (s) => `Long values will break ${s.title} — nothing truncates or wraps deliberately.`,
  (s) => `The destructive action on ${s.title} has no confirmation and no undo.`,
  (s) => `${s.title} carries status in colour alone, which fails for anyone who can't separate those hues.`,
  (s) => `Nothing on ${s.title} says where you are in the flow, or how to get back out.`,
  (s) => `${s.title} shows a number without saying what it counts.`,
];

const MODAL_NOTE = (s) =>
  `The drawer on ${s.title} covers the context you need to fill it in — the list behind it is what you're deciding about.`;

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function notesFor(screen) {
  const h = hash(screen.id || '');
  const first = POOL[h % POOL.length];
  const second = POOL[(h + 3) % POOL.length];
  const notes = [first(screen), second(screen)];
  if (screen.state) notes.unshift(MODAL_NOTE(screen));
  return [...new Set(notes)].slice(0, 3);
}

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

function startStub({ stateDir, delay = 800, interval = 350, log } = {}) {
  const file = path.join(stateDir, 'review.json');
  let handled = 0;
  let pending = null;
  let timer = null;

  const tick = () => {
    const review = readJson(file, null);
    if (!review || review.status !== 'pending') return;
    if (review.requestedAt === handled) return;

    handled = review.requestedAt;
    pending = review;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const current = readJson(file, null);
      if (!current || current.requestedAt !== pending.requestedAt) return;

      const comments = {};
      (pending.screens || []).forEach((screen) => {
        comments[screen.id] = notesFor(screen).map((text) => ({ text }));
      });

      writeJson(file, {
        ...current,
        status: 'done',
        repliedAt: Date.now(),
        reply: { author: 'Agent (stub)', at: Date.now(), comments },
      });
      if (log) log(`replied to ${(pending.screens || []).length} screen(s)`);
    }, delay);
  };

  const loop = setInterval(tick, interval);
  tick();

  return {
    stop() {
      clearInterval(loop);
      clearTimeout(timer);
    },
  };
}

module.exports = { startStub, notesFor };
