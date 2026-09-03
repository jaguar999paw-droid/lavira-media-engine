// Standalone functional test for the 2026-08-03 design-server.js fix.
// Spawns design-server.js as an isolated child (stdio), independent of the
// live Claude Desktop MCP connection, and drives real tool/call requests.
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'src', 'mcp', 'servers', 'design-server.js');
const SOURCE_IMG = '/home/kamau/lavira-media-engine/uploads/samburu_source.jpg';

function runCalls(calls) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const responses = [];
    let idx = 0;
    const timeout = setTimeout(() => { child.kill(); reject(new Error('TIMEOUT waiting for responses, got ' + responses.length + '/' + calls.length)); }, 60000);

    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try { responses.push(JSON.parse(line)); } catch (e) { responses.push({ parseError: e.message, raw: line }); }
        if (responses.length === calls.length) { clearTimeout(timeout); child.kill(); resolve(responses); }
      }
    });
    child.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d));
    child.on('error', reject);

    setTimeout(() => {
      for (const c of calls) child.stdin.write(JSON.stringify(c) + '\n');
    }, 300);
  });
}

(async () => {
  const calls = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'generate_overlay_plan', arguments: { filePath: SOURCE_IMG, destination: 'Samburu', theme: 'cultural_moment' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_content_theme', arguments: { filePath: SOURCE_IMG, destination: 'Samburu' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'apply_overlay', arguments: { filePath: SOURCE_IMG, destination: 'Samburu', hook: 'Northern secrets the maps don\'t show' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'make_ready_to_post', arguments: { filePath: SOURCE_IMG, destination: 'Samburu', caption: 'Test caption', promoType: 'cultural_moment' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'generate_card_template', arguments: { template: 'wildlife_spotlight', data: { destination: 'Samburu' } } } },
  ];
  try {
    const results = await runCalls(calls);
    for (const r of results) {
      console.log('---', r.id, '---');
      console.log(JSON.stringify(r).slice(0, 500));
    }
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
})();
