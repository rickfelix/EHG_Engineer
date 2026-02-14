/**
 * Debug script for terminal-identity.js process tree walking.
 * One-time use — safe to delete after debugging.
 */
import { execSync } from 'child_process';

const pid = process.pid;
console.log('Current PID:', pid);
console.log('PPID:', process.ppid);
console.log('CLAUDE_CODE_SSE_PORT:', process.env.CLAUDE_CODE_SSE_PORT);

// Test the process chain PowerShell script
const script = [
  `$p = ${pid}`,
  '$chain = @()',
  'while ($p -and $p -ne 0) {',
  '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue',
  '  if (-not $proc) { break }',
  '  $chain += "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)"',
  '  $p = $proc.ParentProcessId',
  '}',
  '$chain -join ";"'
].join('\n');

const encoded = Buffer.from(script, 'utf16le').toString('base64');
console.log('\nEncoded length:', encoded.length);

try {
  const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000
  });
  console.log('\nRaw output:', JSON.stringify(raw.trim()));

  const chain = raw.trim().split(';').map(entry => {
    const [p, name, ppid] = entry.split('|');
    return { pid: p, name, ppid };
  });
  console.log('\nProcess chain:');
  chain.forEach((c, i) => console.log(`  [${i}] PID=${c.pid} Name=${c.name} PPID=${c.ppid}`));

  // Now test the actual module
  const { getTerminalId } = await import('../../lib/terminal-identity.js');
  console.log('\ngetTerminalId():', getTerminalId());
} catch (e) {
  console.error('Error:', e.message);
  if (e.stderr) console.error('Stderr:', e.stderr.toString());
  if (e.stdout) console.error('Stdout:', e.stdout.toString());
}
