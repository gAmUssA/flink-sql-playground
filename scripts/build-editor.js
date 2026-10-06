#!/usr/bin/env node
/*
 * Bundles the CodeMirror SQL editor (src/main/frontend/editor.js) into one minified
 * browser script the SPA loads with a plain <script> tag.
 *
 * Usage: node scripts/build-editor.js [out-file]
 *   out-file  default src/main/resources/META-INF/resources/js/editor.bundle.js (gitignored)
 *
 * Needs `npm ci` first. Stdout: one JSON object {outFile, bytes}. Exit 1 with a message
 * on stderr on failure.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO, 'src/main/frontend/editor.js');
const DEFAULT_OUT = path.join(REPO, 'src/main/resources/META-INF/resources/js/editor.bundle.js');

async function bundle(outFile) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (e) {
    throw new Error('esbuild is not installed — run `npm ci` in the repository root first');
  }
  await esbuild.build({
    entryPoints: [ENTRY], outfile: outFile, bundle: true, minify: true, format: 'iife',
    target: ['es2020', 'safari15'], legalComments: 'eof', logLevel: 'warning',
  });
  return { outFile, bytes: fs.statSync(outFile).size };
}

if (require.main === module) {
  bundle(path.resolve(process.argv[2] || DEFAULT_OUT))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => { console.error(`build-editor: ${err.message}`); process.exit(1); });
}

module.exports = { bundle, DEFAULT_OUT };
