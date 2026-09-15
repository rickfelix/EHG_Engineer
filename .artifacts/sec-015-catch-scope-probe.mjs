// Empirically settle: what can a plain `catch (err)` in an async validator actually swallow?
// Each case runs in a child process so a genuinely fatal one can kill it without killing us.
import { spawnSync } from 'node:child_process';

const CASES = {
  // V8 heap exhaustion -- the coordinator's specific concern.
  oom: `
    try {
      const a = [];
      for (;;) a.push(new Array(1e6).fill(Math.random()));
      console.log('SWALLOWED-NOTHING-THREW');
    } catch (err) { console.log('CAUGHT_BY_CATCH:', err.constructor.name); }
    console.log('REACHED_END_OF_SCRIPT');
  `,
  // Explicit process exit from deep inside the guarded region.
  exit: `
    try { process.exit(42); console.log('NOT_REACHED'); }
    catch (err) { console.log('CAUGHT_BY_CATCH:', err.constructor.name); }
    console.log('REACHED_END_OF_SCRIPT');
  `,
  // Stack overflow -- catchable RangeError in V8.
  stack: `
    try { (function f(){ return f(); })(); }
    catch (err) { console.log('CAUGHT_BY_CATCH:', err.constructor.name); }
    console.log('REACHED_END_OF_SCRIPT');
  `,
  // An ordinary programming bug (what computeNearMissFindings would throw) -- now newly covered.
  typeerror: `
    try { null.foo(); }
    catch (err) { console.log('CAUGHT_BY_CATCH:', err.constructor.name); }
    console.log('REACHED_END_OF_SCRIPT');
  `,
  // SIGKILL-class: uncatchable signal delivered to self.
  sigterm: `
    process.on('SIGTERM', () => { console.log('SIGTERM_HANDLER_RAN'); process.exit(9); });
    try { process.kill(process.pid, 'SIGTERM'); setTimeout(()=>{},50); }
    catch (err) { console.log('CAUGHT_BY_CATCH:', err.constructor.name); }
  `,
};

for (const [name, body] of Object.entries(CASES)) {
  const args = name === 'oom' ? ['--max-old-space-size=24', '-e', body] : ['-e', body];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
  const out = (r.stdout || '').trim().replace(/\s+/g, ' ');
  const errFirst = (r.stderr || '').trim().split('\n')[0]?.slice(0, 90) || '';
  console.log(`[${name}] exit=${r.status} signal=${r.signal || '-'}`);
  console.log(`   stdout: ${out || '(none)'}`);
  if (errFirst) console.log(`   stderr: ${errFirst}`);
  const swallowed = out.includes('CAUGHT_BY_CATCH') && out.includes('REACHED_END_OF_SCRIPT');
  console.log(`   => ${swallowed ? 'SWALLOWED by catch (execution continued)' : 'NOT swallowed -- propagated past the catch'}\n`);
}
