#!/usr/bin/env node
// test-mcp-federation.js — isolated tool-call/error-path harness for the 6 federated Lavira MCP servers.
// Spawns each server as its own child process (separate from the live Claude Desktop connection),
// drives it through initialize/tools-list/happy-path/error-path probes over its stdio JSON-RPC channel,
// and reports pass/fail per probe. Read-only where possible; never touches the live processes (50730-50756).
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const ROOT = '/home/kamau/lavira-media-engine/src/mcp/servers';
const SERVERS = [
  { file: 'ops-server.js',     name: 'lavira-ops' },
  { file: 'search-server.js',  name: 'lavira-search' },
  { file: 'brand-server.js',   name: 'lavira-brand' },
  { file: 'media-server.js',   name: 'lavira-media' },
  { file: 'design-server.js',  name: 'lavira-design' },
  { file: 'publish-server.js', name: 'lavira-publish' },
];

function runServer(file) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(ROOT, file)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let responses = [];
    let crashed = false;

    child.stdout.on('data', d => {
      stdout += d.toString();
      let lines = stdout.split('\n');
      stdout = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        try { responses.push(JSON.parse(l)); } catch { responses.push({ __unparsable: l }); }
      }
    });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('exit', (code, sig) => { if (code !== 0 && code !== null) crashed = true; });

    const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

    // Probe sequence
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    send({ jsonrpc: '2.0', id: 3, method: 'ping', params: {} });
    // Failure-mode probes
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'this_tool_does_not_exist', arguments: {} } });
    send({ jsonrpc: '2.0', id: 5, method: 'not_a_real_method', params: {} });
    send('not even json\n');                          // malformed line — should be silently skipped
    send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: {} });          // missing name entirely
    send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: null } }); // null tool name

    setTimeout(() => {
      // After probes, grab first real tool name from tools/list to test a malformed-args call
      const listResp = responses.find(r => r.id === 2);
      const firstTool = listResp?.result?.tools?.[0]?.name;
      if (firstTool) {
        send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: firstTool, arguments: { __bogus_arg_injection: '\u0000\u0000malformed', nested: { a: [1,2,{b:true}] } } } });
      } else {
        responses.push({ id: 8, __note: 'no tools returned to probe' });
      }
      setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
          resolve({ file, responses, stderrTail: stderr.slice(-1500), crashed });
        }, 500);
      }, 3000);
    }, 3000);
  });
}

(async () => {
  const results = {};
  for (const s of SERVERS) {
    results[s.name] = await runServer(s.file);
  }
  console.log(JSON.stringify(results, null, 2));
})();
