#!/usr/bin/env node
/**
 * Diagnostic: trace findClaudeCodePid() process chain and result.
 * Run directly: node scripts/one-time/debug-terminal-identity.mjs
 * Run via npm:  npm run debug:tid
 */
import { execSync } from 'child_process';
import { getTerminalId } from '../../lib/terminal-identity.js';

// Step 1: Show environment
console.log('=== Environment ===');
console.log('PID:', process.pid);
console.log('PPID:', process.ppid);
console.log('CLAUDE_CODE_SSE_PORT:', process.env.CLAUDE_CODE_SSE_PORT || 'NOT_SET');

// Step 2: Walk process tree manually with diagnostics
console.log('\n=== Process Chain (walking from PID ' + process.pid + ') ===');
try {
  const script = `
$p = ${process.pid}
$chain = @()
while ($p -and $p -ne 0) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  $chain += "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)"
  $p = $proc.ParentProcessId
}
$chain -join ";"
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    timeout: 10000
  }).trim();

  const chain = raw.split(';').map(entry => {
    const [pid, name, ppid] = entry.split('|');
    return { pid, name: (name || '').toLowerCase(), ppid };
  });

  chain.forEach((p, i) => {
    // Mark chain break if this node's PPID doesn't match the next node's PID
    const nextNode = chain[i + 1];
    const chainBreak = nextNode && p.ppid !== nextNode.pid ? ` *** CHAIN BREAK: PPID=${p.ppid} but next PID=${nextNode.pid}` : '';
    const deadParent = !nextNode && i < chain.length - 1 ? ' *** DEAD PARENT' : '';
    console.log(`  [${i}] PID=${p.pid}  Name=${p.name}  PPID=${p.ppid}${chainBreak}${deadParent}`);
  });

  // Check: did the walk reach Claude Code?
  const lastEntry = chain[chain.length - 1];
  console.log(`\n  Chain depth: ${chain.length} entries`);
  console.log(`  Chain ends at: PID=${lastEntry.pid} Name=${lastEntry.name}`);
  console.log(`  Last entry's PPID: ${lastEntry.ppid}`);

  // Check if lastEntry's parent is alive
  try {
    const parentScript = `
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=${lastEntry.ppid}" -ErrorAction SilentlyContinue
if ($proc) { Write-Output "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)" } else { Write-Output "DEAD" }
`;
    const parentEncoded = Buffer.from(parentScript, 'utf16le').toString('base64');
    const parentResult = execSync(`powershell -NoProfile -EncodedCommand ${parentEncoded}`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000
    }).trim();
    console.log(`  Parent of last entry (PID=${lastEntry.ppid}): ${parentResult}`);
  } catch { /* ignore */ }

  // Apply the findClaudeCodePid algorithm
  console.log('\n=== Algorithm Walk ===');
  let matched = false;
  for (let i = 1; i < chain.length; i++) {
    const proc = chain[i];
    if (proc.name === 'node.exe' || proc.name === 'node') {
      const parent = chain[i + 1];
      const parentName = parent ? parent.name : 'NONE';
      const shellNames = ['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh'];
      const isShellParent = parent && shellNames.includes(parent.name);
      console.log(`  [${i}] node PID=${proc.pid}, parent=[${i+1}] ${parentName}, isShell=${isShellParent}`);
      if (!isShellParent) {
        console.log(`  >> MATCH: Claude Code PID = ${proc.pid}`);
        matched = true;
        break;
      } else {
        console.log(`  >> SKIP: parent is shell/node`);
      }
    }
  }
  if (!matched) {
    console.log('  >> NO MATCH: findClaudeCodePid() returns null');

    // Additional: check if the known Claude Code PID (from SSE port session files) is reachable
    console.log('\n=== Fallback: Check known CC processes ===');
    try {
      const ccScript = `
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*claude-code*' } | ForEach-Object { "$($_.ProcessId)|$($_.Name)|$($_.ParentProcessId)|$($_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length)))" }
`;
      const ccEncoded = Buffer.from(ccScript, 'utf16le').toString('base64');
      const ccResult = execSync(`powershell -NoProfile -EncodedCommand ${ccEncoded}`, {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000
      }).trim();
      console.log('  Claude Code processes found:');
      ccResult.split('\n').forEach(line => console.log('    ' + line));
    } catch (e) {
      console.log('  Failed to scan:', e.message);
    }
  }
} catch (err) {
  console.error('Process chain walk failed:', err.message);
}

// Step 3: Show actual result from getTerminalId()
console.log('\n=== Result ===');
console.log('getTerminalId():', getTerminalId());
