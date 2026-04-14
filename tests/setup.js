/**
 * Test Setup - Jest setupFiles
 * Loads data.js functions into global scope before tests run
 */

const fs = require('fs');
const path = require('path');

// Mock localStorage
class MockStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
  get length() { return Object.keys(this.store).length; }
  key(i) { return Object.keys(this.store)[i] || null; }
}

// Setup globals
global.localStorage = new MockStorage();
global.scrollTo = () => {};
Object.defineProperty(global, 'navigator', {
  value: { onLine: true, serviceWorker: { register: () => Promise.resolve() } },
  writable: true, configurable: true
});

// Load data.js and transform to assign everything to global
let code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');

// Replace top-level const/let with global assignments
// "const DB = {" -> "global.DB = {"
// "function getPlayers()" -> "global.getPlayers = function getPlayers()"
code = code.replace(/^const\s+(\w+)\s*=/gm, 'global.$1 =');
code = code.replace(/^let\s+(\w+)\s*=/gm, 'global.$1 =');
code = code.replace(/^function\s+(\w+)\s*\(/gm, 'global.$1 = function $1(');

// Execute
eval(code);

// Helper
global.__clearAllData = () => { global.localStorage.clear(); };
