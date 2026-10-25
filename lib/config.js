// Config discovery. Everything is optional: a project with no config file still
// runs, and the canvas falls back to crawling the app for its screens.
//
//   canvas.config.mjs  { app, title, screens: [{ key, state?, title?, group? }] }

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const NAMES = ['canvas.config.mjs', 'canvas.config.js', 'canvas.config.cjs', 'canvas.config.json'];

function titleFromKey(key) {
  const last = key.split('/').filter(Boolean).pop() || key;
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A route in a manifest is written without its leading slash: `cases`, `case/2291`.
// People write it either way in config, so normalise here and never again.
function normaliseScreens(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw) continue;
    const entry = typeof raw === 'string' ? { key: raw } : raw;
    const key = String(entry.key || entry.route || '')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\?.*$/, '');
    if (!key) continue;
    const state = entry.state ? String(entry.state).replace(/^[#?]+/, '') : '';
    const id = state ? key + '~' + state : key;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key,
      state,
      title: entry.title || titleFromKey(key),
      group: entry.group || 'Screens',
    });
  }
  return out;
}

async function loadConfig(cwd, explicit) {
  const names = explicit ? [explicit] : NAMES;
  for (const name of names) {
    const file = path.resolve(cwd, name);
    if (!fs.existsSync(file)) continue;

    let raw;
    try {
      if (file.endsWith('.json')) {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      } else {
        const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
        raw = mod.default || mod;
      }
    } catch (err) {
      throw new Error(`Could not read ${path.basename(file)}: ${err.message}`);
    }

    if (typeof raw === 'function') raw = await raw();
    raw = raw || {};

    const screens = normaliseScreens(raw.screens);

    return {
      file,
      app: raw.app || null,
      title: raw.title || null,
      router: raw.router === 'query' ? 'query' : 'path',
      screens,
    };
  }

  return { file: null, app: null, title: null, router: 'path', screens: [] };
}

module.exports = { loadConfig, normaliseScreens, titleFromKey, NAMES };
