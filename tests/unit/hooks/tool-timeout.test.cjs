/**
 * Unit tests for scripts/hooks/lib/tool-timeout.cjs
 * SD-LEO-INFRA-WORKER-SOURCE-SIDE-001
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  extractToolTimeout,
  computeExpectedSilenceMs,
  computeExpectedEndMs,
  classifyActivityKind,
  clampSilenceMs,
  MAX_SILENCE_MS,
  DEFAULT_AGENT_SILENCE_MS,
  DEFAULT_WEBFETCH_MS,
  DEFAULT_BASH_MS,
  TOOL_BUFFER_MS,
} = require(path.resolve(__dirname, '../../../scripts/hooks/lib/tool-timeout.cjs'));

// ── extractToolTimeout ─────────────────────────────────────────────────────────

test('extractToolTimeout honors explicit Bash timeout', () => {
  assert.equal(extractToolTimeout('Bash', { timeout: 300000 }), 300000);
});

test('extractToolTimeout falls back to DEFAULT_BASH_MS when Bash has no timeout', () => {
  assert.equal(extractToolTimeout('Bash', {}), DEFAULT_BASH_MS);
});

test('extractToolTimeout handles Bash timeout passed as JSON string', () => {
  assert.equal(extractToolTimeout('Bash', JSON.stringify({ timeout: 45000 })), 45000);
});

test('extractToolTimeout uses DEFAULT_AGENT_SILENCE_MS for Agent/Task', () => {
  assert.equal(extractToolTimeout('Agent', {}), DEFAULT_AGENT_SILENCE_MS);
  assert.equal(extractToolTimeout('Task', null), DEFAULT_AGENT_SILENCE_MS);
});

test('extractToolTimeout uses DEFAULT_WEBFETCH_MS for WebFetch with no timeout', () => {
  assert.equal(extractToolTimeout('WebFetch', {}), DEFAULT_WEBFETCH_MS);
});

test('extractToolTimeout returns null for instant tools (Edit/Read/Write/Glob/Grep)', () => {
  for (const t of ['Edit', 'Read', 'Write', 'Glob', 'Grep']) {
    assert.equal(extractToolTimeout(t, {}), null, `tool=${t}`);
  }
});

test('extractToolTimeout returns null when toolName is missing', () => {
  assert.equal(extractToolTimeout('', {}), null);
  assert.equal(extractToolTimeout(null, {}), null);
});

test('extractToolTimeout ignores malformed JSON input', () => {
  assert.equal(extractToolTimeout('Bash', 'not-json'), DEFAULT_BASH_MS);
});

// ── computeExpectedSilenceMs ──────────────────────────────────────────────────

test('computeExpectedSilenceMs returns null for short tools (<60s)', () => {
  assert.equal(computeExpectedSilenceMs('Bash', { timeout: 30000 }), null);
});

test('computeExpectedSilenceMs adds TOOL_BUFFER_MS and respects MIN_SILENCE_WINDOW_MS floor', () => {
  // 60s Bash → floored to 120s (MIN_SILENCE_WINDOW_MS) + 30s buffer = 150000
  const ms = computeExpectedSilenceMs('Bash', { timeout: 60000 });
  assert.equal(ms, 2 * 60 * 1000 + TOOL_BUFFER_MS);
});

test('computeExpectedSilenceMs clamps at MAX_SILENCE_MS (30m)', () => {
  const ms = computeExpectedSilenceMs('Bash', { timeout: 10 * 60 * 60 * 1000 }); // 10h
  assert.equal(ms, MAX_SILENCE_MS);
});

test('computeExpectedSilenceMs for Agent/Task uses the 30m default (clamped)', () => {
  const ms = computeExpectedSilenceMs('Agent', {});
  // DEFAULT_AGENT_SILENCE_MS = 30m = MAX_SILENCE_MS, so +buffer clamps to MAX.
  assert.equal(ms, MAX_SILENCE_MS);
});

test('computeExpectedSilenceMs returns null for instant tools', () => {
  assert.equal(computeExpectedSilenceMs('Edit', {}), null);
});

// ── computeExpectedEndMs ──────────────────────────────────────────────────────

test('computeExpectedEndMs adds TOOL_BUFFER_MS to the raw timeout', () => {
  assert.equal(computeExpectedEndMs('Bash', { timeout: 60000 }), 60000 + TOOL_BUFFER_MS);
});

test('computeExpectedEndMs returns null for instant tools', () => {
  assert.equal(computeExpectedEndMs('Read', {}), null);
});

// ── classifyActivityKind ──────────────────────────────────────────────────────

test('classifyActivityKind maps tools to worker activity states', () => {
  assert.equal(classifyActivityKind('Bash'), 'waiting_tool');
  assert.equal(classifyActivityKind('WebFetch'), 'waiting_tool');
  assert.equal(classifyActivityKind('Agent'), 'waiting_agent');
  assert.equal(classifyActivityKind('Task'), 'waiting_agent');
  assert.equal(classifyActivityKind('Edit'), 'executing');
  assert.equal(classifyActivityKind('Read'), 'executing');
  assert.equal(classifyActivityKind(''), null);
  assert.equal(classifyActivityKind(null), null);
});

// ── clampSilenceMs ────────────────────────────────────────────────────────────

test('clampSilenceMs rejects non-finite / negative values', () => {
  assert.equal(clampSilenceMs(NaN), 0);
  assert.equal(clampSilenceMs(-5), 0);
  assert.equal(clampSilenceMs('x'), 0);
});

test('clampSilenceMs never exceeds MAX_SILENCE_MS', () => {
  assert.equal(clampSilenceMs(MAX_SILENCE_MS * 10), MAX_SILENCE_MS);
});
