#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'logs', 'backups', 'data', '.git']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let failed = 0;

for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error('Syntax error:', path.relative(ROOT, file));
  }
}

if (failed) {
  console.error(`check-syntax: ${failed} file(s) failed`);
  process.exit(1);
}

console.log(`check-syntax: OK (${files.length} files)`);
