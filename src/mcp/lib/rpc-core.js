#!/usr/bin/env node
// src/mcp/lib/rpc-core.js — Shared JSON-RPC stdio dispatcher for Lavira federated MCP servers
// v2.0.0 — Async-hardened: per-call timeout, concurrency cap, queue, graceful drain on SIGTERM
// All sub-servers require this module and call: rpc.start({ name, version, tools, handlers })
'use strict';

// ── Redirect console.* to stderr so stdout stays clean for JSON-RPC ────────
const _se = (l, a) => process.stderr.write('[' + l + '] ' + a.map(String).join(' ') + '\n');
console.log   = (...a) => _se('log',   a);
console.info  = (...a) => _se('info',  a);
console.warn  = (...a) => _se('warn',  a);
console.error = (...a) => _se('error', a);
console.debug = (...a) => _se('debug', a);

require('dotenv').config({
  path: process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../../../..', '.env')
});

const cfg = require('../../config');
const fs  = require('fs');
[cfg.UPLOADS_DIR, cfg.OUTPUTS_DIR, cfg.ASSETS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Async configuration (env-overridable, sensible defaults) ────────────────
const CALL_TIMEOUT_MS  = parseInt(process.env.RPC_CALL_TIMEOUT_MS  || '120000', 10); // 2 min per tool call
const MAX_CONCURRENCY  = parseInt(process.env.RPC_MAX_CONCURRENCY  || '4',      10); // max parallel handler calls
const DRAIN_TIMEOUT_MS = parseInt(process.env.RPC_DRAIN_TIMEOUT_MS || '10000',  10); // SIGTERM drain window

// ── Concurrency limiter (simple token-bucket queue) ─────────────────────────
let _active = 0;
const _queue = [];

function _acquireSlot() {
  return new Promise(resolve => {
    if (_active < MAX_CONCURRENCY) { _active++; resolve(); }
    else { _queue.push(resolve); }
  });
}

function _releaseSlot() {
  if (_queue.length > 0) {
    const next = _queue.shift();
    next(); // hand slot to waiting caller
  } else {
    _active--;
  }
}


// ── Per-tool call metrics ─────────────────────────────────────────────────────
const _metrics = {}; // { toolName: { calls, errors, totalMs, lastCalledAt } }

function _recordMetric(toolName, durationMs, isError) {
  if (!_metrics[toolName]) _metrics[toolName] = { calls: 0, errors: 0, totalMs: 0, lastCalledAt: null };
  const m = _metrics[toolName];
  m.calls++;
  if (isError) m.errors++;
  m.totalMs += durationMs;
  m.lastCalledAt = new Date().toISOString();
}

function getMetrics() {
  return Object.entries(_metrics).map(([name, m]) => ({
    tool: name, calls: m.calls, errors: m.errors,
    avgMs: m.calls ? Math.round(m.totalMs / m.calls) : 0,
    totalMs: m.totalMs, lastCalledAt: m.lastCalledAt,
  })).sort((a, b) => b.calls - a.calls);
}

// ── Per-call timeout wrapper ─────────────────────────────────────────────────
function withTimeout(promise, ms, toolName) {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(
      () => reject(new Error(`Tool '${toolName}' timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      v => { clearTimeout(tid); resolve(v); },
      e => { clearTimeout(tid); reject(e); }
    );
  });
}

// ── JSON-RPC wire helpers ────────────────────────────────────────────────────
function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function error(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

// ── Graceful drain tracker ───────────────────────────────────────────────────
let _pendingCalls = 0;
let _draining     = false;

function _startCall() { _pendingCalls++; }
function _endCall()   {
  _pendingCalls--;
  if (_draining && _pendingCalls === 0) process.exit(0);
}

// ── Main start function ──────────────────────────────────────────────────────
function start({ name, version = '1.0.0', tools = [], handlers = {} }) {
  let buf = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      const { id, method, params } = msg;

      if (method === 'initialize') {
        respond(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name, version },
          capabilities: { tools: {} }
        });

      } else if (method === 'tools/list') {
        respond(id, { tools });

      } else if (method === 'tools/call') {
        const toolName = params?.name;
        const args     = params?.arguments || {};
        const handler  = handlers[toolName];

        if (!handler) {
          error(id, -32601, `Unknown tool: ${toolName}`);
          continue;
        }

        _startCall();

        // Acquire concurrency slot → run handler with timeout → release slot
        const _t0 = Date.now();
        let _metricError = false;
        _acquireSlot()
          .then(() => {
            return withTimeout(
              Promise.resolve().then(() => handler(args)),
              CALL_TIMEOUT_MS,
              toolName
            );
          })
          .then(result => {
            const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            respond(id, { content: [{ type: 'text', text }] });
          })
          .catch(err => {
            _metricError = true;
            error(id, -32603, err?.message || String(err));
          })
          .finally(() => {
            _recordMetric(toolName, Date.now() - _t0, _metricError);
            _releaseSlot();
            _endCall();
          });

      } else if (method === 'ping') {
        respond(id, {});

      } else {
        // Notifications (no id) — silently ignore
        if (id !== undefined && id !== null) {
          error(id, -32601, `Method not found: ${method}`);
        }
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));

  // SIGTERM: stop accepting new work, drain in-flight calls, then exit
  process.on('SIGTERM', () => {
    _draining = true;
    process.stderr.write(`[rpc-core] SIGTERM received — draining ${_pendingCalls} in-flight call(s)...\n`);
    if (_pendingCalls === 0) { process.exit(0); return; }
    setTimeout(() => {
      process.stderr.write('[rpc-core] Drain timeout exceeded — forcing exit\n');
      process.exit(1);
    }, DRAIN_TIMEOUT_MS).unref();
  });

  process.on('SIGINT', () => process.exit(0));

  process.stderr.write(
    `[rpc-core] ${name} v${version} ready (stdio) | concurrency=${MAX_CONCURRENCY} timeout=${CALL_TIMEOUT_MS}ms\n`
  );
}

module.exports = { start, getMetrics };
