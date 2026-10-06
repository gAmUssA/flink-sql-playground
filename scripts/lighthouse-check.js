#!/usr/bin/env node
/*
 * Runs Lighthouse (mobile preset) against a URL and fails when a category scores below its
 * minimum. Uses Playwright's Chromium, so no separate Chrome install is needed.
 *
 * Usage: node scripts/lighthouse-check.js <url> <category=min>...
 *   e.g. node scripts/lighthouse-check.js http://127.0.0.1:8790/ accessibility=95
 * Stdout: one JSON object {url, scores, failed}. Exit 1 when any minimum is missed.
 */
'use strict';

const { chromium } = require('@playwright/test');

function parseMinimums(args) {
  return Object.fromEntries(args.map((arg) => {
    const m = /^([a-z-]+)=(\d+)$/.exec(arg);
    if (!m) throw new Error(`expected category=min (e.g. accessibility=95), got: ${arg}`);
    return [m[1], Number(m[2])];
  }));
}

async function run(url, minimums) {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: Object.keys(minimums) });
    const scores = Object.fromEntries(Object.keys(minimums).map((c) => [c, Math.round(result.lhr.categories[c].score * 100)]));
    const failed = Object.entries(minimums).filter(([c, min]) => scores[c] < min).map(([c, min]) => `${c} ${scores[c]} < ${min}`);
    const audits = Object.values(result.lhr.audits).filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map((a) => a.id);
    return { url, scores, failed, failingAudits: audits };
  } finally {
    await chrome.kill();
  }
}

if (require.main === module) {
  const [url, ...rest] = process.argv.slice(2);
  if (!url || rest.length === 0) {
    console.error('usage: node scripts/lighthouse-check.js <url> <category=min>...');
    process.exit(1);
  }
  run(url, parseMinimums(rest))
    .then((report) => { console.log(JSON.stringify(report)); process.exit(report.failed.length ? 1 : 0); })
    .catch((e) => { console.error(`lighthouse-check: ${e.message}`); process.exit(1); });
}

module.exports = { parseMinimums };
