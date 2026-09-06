// audit.js - run inside the lavira-media-engine repo root on the target machine
'use strict';
const fs = require('fs');
const path = require('path');

const serversDir = path.join(__dirname, 'src', 'mcp', 'servers');
const files = fs.readdirSync(serversDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const full = path.join(serversDir, file);
  const src = fs.readFileSync(full, 'utf8');

  // 1) Map local var name -> required module (resolve & require it to inspect real exports)
  const reqRe = /(?:let|const)\s+([A-Za-z0-9_]+)(?:\s*,\s*[A-Za-z0-9_]+)*\s*;|try\s*\{\s*([A-Za-z0-9_]+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  const varToModule = {};
  let m;
  const reqLineRe = /([A-Za-z0-9_]+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  while ((m = reqLineRe.exec(src))) {
    const varName = m[1];
    const modPath = m[2];
    if (modPath.startsWith('.')) {
      let resolved;
      try { resolved = require.resolve(path.join(serversDir, modPath)); } catch (e) { resolved = null; }
      varToModule[varName] = { modPath, resolved };
    }
  }

  // 2) Load actual exports for each resolved module
  const varExports = {};
  for (const [varName, info] of Object.entries(varToModule)) {
    if (!info.resolved) { varExports[varName] = null; continue; }
    try {
      delete require.cache[info.resolved];
      const mod = require(info.resolved);
      varExports[varName] = Object.keys(mod);
    } catch (e) {
      varExports[varName] = 'REQUIRE_ERROR: ' + e.message;
    }
  }

  // 3) Find every `varName?.methodName(` or `varName.methodName(` usage inside HANDLERS
  const callRe = /\b([A-Za-z0-9_]+)\??\.\s*([A-Za-z0-9_]+)\s*\(/g;
  const seen = new Set();
  const issues = [];
  while ((m = callRe.exec(src))) {
    const varName = m[1];
    const method = m[2];
    if (!(varName in varExports)) continue; // not one of our engine vars
    const key = varName + '.' + method;
    if (seen.has(key)) continue;
    seen.add(key);
    const exp = varExports[varName];
    if (exp === null) {
      issues.push(`  MODULE-NOT-FOUND: ${varName}.${method}() -- ${varToModule[varName].modPath} did not resolve`);
    } else if (typeof exp === 'string') {
      issues.push(`  MODULE-ERROR: ${varName}.${method}() -- ${exp}`);
    } else if (!exp.includes(method)) {
      issues.push(`  MISMATCH: ${varName}.${method}() -- not found on ${varToModule[varName].modPath}. Real exports: ${exp.join(', ')}`);
    }
  }

  console.log('=== ' + file + ' ===');
  if (issues.length === 0) console.log('  OK - all engine.method() calls resolve to real exports');
  else issues.forEach(i => console.log(i));
  console.log('');
}
