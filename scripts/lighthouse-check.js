#!/usr/bin/env node
/*
 * Runs Lighthouse (mobile preset) against a URL and fails when a category scores below its
 * minimum. Uses Playwright's Chromium, so no separate Chrome install is needed.
 *
 * Usage: node scripts/lighthouse-check.js <url> <category=min>... [transfer-kb=max] [--theme=<name>]
 *   e.g. node scripts/lighthouse-check.js http://127.0.0.1:8790/ accessibility=95 performance=85 transfer-kb=400
 *   transfer-kb caps the bytes transferred on first load (Lighthouse total-byte-weight), in KiB.
 *   --theme audits the page in one theme (nebula, carbon or cobalt), as if the user had picked it.
 *   Without it the page follows the browser's colour scheme, as on a first visit (light: cobalt).
 * Runs Lighthouse 3 times (each in a fresh Chrome) and scores the median of each category.
 * Stdout: one JSON object {url, theme, scores, transferKb, failed, failingAudits, runs}. scores and
 * transferKb are medians; runs lists the per-run {category..., transferKb}. Exit 1 when any
 * minimum or the transfer cap is missed.
 */
'use strict';

// Heavy dependencies (@playwright/test, lighthouse, chrome-launcher, puppeteer-core) are loaded
// inside the functions that need them, so the pure helpers load with plain node (jsTest in CI).

// The themes and the key js/app.js keeps the user's choice under (TWEAKS_KEY).
const THEMES = ['nebula', 'carbon', 'cobalt'];
const TWEAKS_KEY = 'fsf-tweaks-v2';

/** Splits off --theme=<name> (or --theme <name>) from the other arguments. */
function parseArgs(args) {
  const rest = [];
  let theme = null;
  for (let i = 0; i < args.length; i++) {
    const m = /^--theme(?:=(.*))?$/.exec(args[i]);
    if (!m) { rest.push(args[i]); continue; }
    theme = m[1] !== undefined ? m[1] : args[++i];
    if (!THEMES.includes(theme)) throw new Error(`--theme must be one of ${THEMES.join(', ')}, got: ${theme}`);
  }
  return { theme, rest };
}

function parseMinimums(args) {
  return Object.fromEntries(args.map((arg) => {
    const m = /^([a-z-]+)=(\d+)$/.exec(arg);
    if (!m) throw new Error(`expected category=min (e.g. accessibility=95), got: ${arg}`);
    return [m[1], Number(m[2])];
  }));
}

/**
 * A page of the launched Chrome on which every new document of the audited origin starts with the
 * theme saved as the user's explicit choice. Lighthouse clears the origin's storage before it
 * loads the page, so the choice cannot be saved ahead of the run; a script that runs before the
 * page's own, in each new document, puts it back. puppeteer-core is Lighthouse's own dependency.
 */
async function themedPage(port, url, theme) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.evaluateOnNewDocument((origin, key, value) => {
    // Lighthouse opens about:blank too, where storage is off limits.
    if (location.origin === origin) localStorage.setItem(key, value);
  }, new URL(url).origin, TWEAKS_KEY, JSON.stringify({ theme, themeExplicit: true }));
  return { browser, page };
}

/** Median of a list of numbers; the mean of the two middle ones for an even count. Does not sort in place. */
function median(values) {
  if (values.length === 0) throw new Error('median of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Runs per URL: one Lighthouse run of a small page swings several points of performance.
const RUNS = 3;

/** One Lighthouse run in its own Chrome, so runs share no cache, storage or process state. */
async function auditOnce(url, minimums, includePerformance, theme) {
  const { chromium } = require('@playwright/test');
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
  let themed = null;
  try {
    // total-byte-weight is reported only when the performance category runs.
    const categories = includePerformance ? [...new Set([...Object.keys(minimums), 'performance'])] : Object.keys(minimums);
    const flags = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: categories };
    if (theme) themed = await themedPage(chrome.port, url, theme);
    const result = await lighthouse(url, flags, undefined, themed ? themed.page : undefined);
    // The theme the audited page was in, read from its root element.
    const audited = themed ? await themed.page.evaluate(() => document.documentElement.dataset.theme) : null;
    if (theme && audited !== theme) throw new Error(`audited in theme ${audited}, not ${theme}`);
    const scores = Object.fromEntries(Object.keys(minimums).map((c) => [c, Math.round(result.lhr.categories[c].score * 100)]));
    const weight = result.lhr.audits['total-byte-weight'];
    const transferKb = weight && weight.numericValue !== undefined ? Math.round(weight.numericValue / 1024) : null;
    const audits = Object.values(result.lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map((a) => a.id);
    return { scores, transferKb, failingAudits: audits };
  } finally {
    if (themed) await themed.browser.disconnect();
    await chrome.kill();
  }
}

/**
 * Audits the URL RUNS times, one after the other (parallel runs add CPU noise), and checks the
 * median of each category and of the transfer size against the minimums and the cap.
 */
async function run(url, { 'transfer-kb': maxTransferKb, ...minimums }, theme = null) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await auditOnce(url, minimums, maxTransferKb !== undefined, theme);
    runs.push({ ...r.scores, transferKb: r.transferKb, failingAudits: r.failingAudits });
  }
  const scores = Object.fromEntries(Object.keys(minimums).map((c) => [c, median(runs.map((r) => r[c]))]));
  const failed = Object.entries(minimums).filter(([c, min]) => scores[c] < min).map(([c, min]) => `${c} ${scores[c]} < ${min}`);
  const kbs = runs.map((r) => r.transferKb);
  const transferKb = kbs.includes(null) ? null : median(kbs);
  if (maxTransferKb !== undefined && (transferKb === null || transferKb > maxTransferKb)) {
    failed.push(`transfer ${transferKb} KiB > ${maxTransferKb} KiB`);
  }
  // An audit is listed when it failed in most runs, like the score it feeds.
  const counts = new Map();
  for (const r of runs) for (const id of r.failingAudits) counts.set(id, (counts.get(id) || 0) + 1);
  const failingAudits = [...counts].filter(([, n]) => n > RUNS / 2).map(([id]) => id);
  return { url, theme, scores, transferKb, failed, failingAudits, runs: runs.map(({ failingAudits: _omit, ...rest }) => rest) };
}

if (require.main === module) {
  const usage = 'usage: node scripts/lighthouse-check.js <url> <category=min>... [--theme=nebula|carbon|cobalt]';
  let args;
  try {
    const { theme, rest: [url, ...rest] } = parseArgs(process.argv.slice(2));
    if (!url || rest.length === 0) throw new Error(usage);
    args = [url, parseMinimums(rest), theme];
  } catch (e) {
    console.error(`lighthouse-check: ${e.message}`);
    process.exit(1);
  }
  run(...args)
    .then((report) => { console.log(JSON.stringify(report)); process.exit(report.failed.length ? 1 : 0); })
    .catch((e) => { console.error(`lighthouse-check: ${e.message}`); process.exit(1); });
}

module.exports = { parseMinimums, parseArgs, median };
