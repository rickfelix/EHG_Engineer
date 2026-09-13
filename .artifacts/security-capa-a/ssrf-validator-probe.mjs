import { validateDeploymentUrl } from 'file:///C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A/scripts/eva/capa-001-a-baseline-runner.mjs';
const cases = [
  ['file:///C:/Users/rickf/.env',                 'BLOCK', 'file:// local disclosure (SEC-2 sharpest limb)'],
  ['http://example.com/',                          'BLOCK', 'plain http downgrade'],
  ['https://user:pass@example.com/',               'BLOCK', 'embedded credentials'],
  ['https://127.0.0.1/',                           'BLOCK', 'IPv4 loopback'],
  ['https://localhost:3000/',                      'BLOCK', 'localhost'],
  ['https://169.254.169.254/latest/meta-data/',    'BLOCK', 'cloud metadata IP'],
  ['https://10.0.0.5/',                            'BLOCK', 'private 10/8'],
  ['https://192.168.1.1/',                         'BLOCK', 'private 192.168/16'],
  ['https://172.17.0.1/',                          'BLOCK', 'private 172.16/12'],
  ['https://[::1]/',                               'BLOCK', 'IPv6 loopback bracketed'],
  ['https://[0:0:0:0:0:0:0:1]/',                   'BLOCK', 'IPv6 loopback EXPANDED form'],
  ['https://2130706433/',                          'BLOCK', 'IPv4 as DECIMAL (127.0.0.1)'],
  ['https://0x7f000001/',                          'BLOCK', 'IPv4 as HEX (127.0.0.1)'],
  ['https://127.1/',                               'BLOCK', 'IPv4 short form (127.0.0.1)'],
  ['https://[::ffff:127.0.0.1]/',                  'BLOCK', 'IPv4-MAPPED IPv6 loopback'],
  ['https://[fe80::1]/',                           'BLOCK', 'IPv6 LINK-LOCAL'],
  ['https://[fd00::1]/',                           'BLOCK', 'IPv6 UNIQUE-LOCAL'],
  ['https://100.64.0.1/',                          'BLOCK', 'carrier-grade NAT 100.64/10'],
  ['https://supabase/',                            'BLOCK', 'bare single-label internal host'],
  ['https://kubernetes.default.svc.cluster.local/','BLOCK', 'internal cluster DNS'],
  ['https://altifyai.app',                         'ALLOW', 'real live venture URL'],
  ['https://marketlens-429436826471.us-central1.run.app', 'ALLOW', 'real live venture URL'],
  ['https://example.com/?utm=a&utm_medium=b',      'ALLOW', 'legal & in query string (must NOT be rejected)'],
];
let surprises = [];
for (const [url, expect, label] of cases) {
  let got, detail = '';
  try { const r = validateDeploymentUrl(url); got = 'ALLOW'; detail = '-> ' + r; }
  catch (e) { got = 'BLOCK'; detail = '(' + e.message.slice(0, 60) + ')'; }
  const ok = got === expect;
  if (!ok) surprises.push(`${label}: expected ${expect}, got ${got}  [${url}]`);
  console.log(`${ok ? '  ok ' : 'GAP '} ${got.padEnd(5)} ${label.padEnd(48)} ${url}`);
}
console.log('\n=== DEVIATIONS FROM A STRICT SSRF POSTURE: ' + surprises.length + ' ===');
surprises.forEach((s) => console.log('  - ' + s));
