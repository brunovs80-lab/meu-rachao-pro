#!/usr/bin/env node
/**
 * Cross-platform gradle wrapper runner.
 * Usage: node scripts/run-gradle.js <task> [<task> ...]
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const isWin = process.platform === 'win32';
const wrapper = path.join(ANDROID, isWin ? 'gradlew.bat' : 'gradlew');

const tasks = process.argv.slice(2);
if (!tasks.length) {
  console.error('Usage: node scripts/run-gradle.js <task> [<task> ...]');
  process.exit(1);
}

// Windows precisa de shell: true para executar .bat via spawn.
const result = spawnSync(wrapper, tasks, { cwd: ANDROID, stdio: 'inherit', shell: isWin });
if (result.error) {
  console.error('[run-gradle] erro ao executar wrapper:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
