#!/usr/bin/env node
/**
 * Option A Candidate: Native Process Tree Walk
 *
 * Uses @vscode/windows-process-tree (if available) or falls back to
 * tasklist /v parsing to walk the process ancestry chain and find
 * the Claude Code ancestor node.exe.
 *
 * This replaces the PowerShell-based findClaudeCodePid() with a
 * sub-20ms native alternative.
 */

const { execSync } = require('child_process');

async function findClaudeCodePidNative() {
  const start = performance.now();

  // Try @vscode/windows-process-tree first
  try {
    const wpt = require('@vscode/windows-process-tree');
    const list = await new Promise((resolve, reject) => {
      wpt.getProcessList(0, (processList) => {
        if (processList) resolve(processList);
        else reject(new Error('getProcessList returned null'));
      }, 0 /* PROCESS_FIELD_COMMANDLINE */);
    });

    // Build PID -> PPID map
    const pidMap = new Map();
    for (const p of list) {
      pidMap.set(p.pid, { ppid: p.ppid, name: p.name });
    }

    // Walk up from current process
    let current = process.pid;
    const chain = [];
    const visited = new Set();

    while (current && !visited.has(current)) {
      visited.add(current);
      const info = pidMap.get(current);
      if (!info) break;
      chain.push({ pid: current, name: info.name, ppid: info.ppid });

      // Check if this is a Claude Code node.exe (has SSE port in args)
      // For now, find the topmost node.exe whose parent is NOT node/bash/sh
      if (info.name === 'node.exe') {
        const parent = pidMap.get(info.ppid);
        if (parent && !['node.exe', 'bash.exe', 'sh.exe', 'powershell.exe', 'pwsh.exe'].includes(parent.name)) {
          const elapsed = Math.round((performance.now() - start) * 100) / 100;
          return { pid: current, method: 'native-tree', latency_ms: elapsed, chain };
        }
      }
      current = info.ppid;
    }

    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    return { pid: null, method: 'native-tree-no-match', latency_ms: elapsed, chain };
  } catch (e) {
    // Fallback: tasklist parsing
    return findClaudeCodePidTasklist(start);
  }
}

function findClaudeCodePidTasklist(start) {
  try {
    const output = execSync('tasklist /v /fo csv /nh', { encoding: 'utf8', timeout: 5000 });
    const lines = output.trim().split('\n');
    const nodeProcesses = [];

    for (const line of lines) {
      if (line.includes('node.exe')) {
        const parts = line.split('","');
        if (parts.length >= 2) {
          const pid = parseInt(parts[1]);
          if (!isNaN(pid)) nodeProcesses.push(pid);
        }
      }
    }

    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    return {
      pid: nodeProcesses.length > 0 ? nodeProcesses[0] : null,
      method: 'tasklist-fallback',
      latency_ms: elapsed,
      node_processes: nodeProcesses.length
    };
  } catch (e) {
    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    return { pid: null, method: 'tasklist-error', latency_ms: elapsed, error: e.message };
  }
}

if (require.main === module) {
  console.log('========================================');
  console.log('  NATIVE PROCESS TREE WALK PoC');
  console.log('========================================');
  console.log('  Current PID:', process.pid);
  console.log('  Parent PID:', process.ppid);
  console.log('');

  findClaudeCodePidNative().then(result => {
    console.log('  Result:', JSON.stringify(result, null, 2));
    console.log('');

    if (result.chain) {
      console.log('  Ancestry Chain:');
      for (const entry of result.chain) {
        console.log(`    PID ${entry.pid} (${entry.name}) -> parent ${entry.ppid}`);
      }
    }

    console.log('');
    console.log('  Latency: ' + result.latency_ms + 'ms');
    console.log('  Method:  ' + result.method);
    console.log('========================================');
  });
}

module.exports = { findClaudeCodePidNative };
