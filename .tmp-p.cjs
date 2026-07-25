const fs=require('fs');
let a=fs.readFileSync('tests/unit/fleet/spawn-control.test.js','utf8');
const oldH="    const helperNames = ['roleOf', 'isSingletonRole', 'resolveProfileDir', 'isLiveEnabled', 'buildLiveSpawnInvocation'];";
const newH="    // The guard exists to catch an undocumented 7th VERB, not to freeze the helper surface. The two\n    // session-bind constants are exported so the budget can be asserted directly instead of by\n    // wall-clock; they are values, not verbs, so they belong on this allowlist.\n    const helperNames = ['roleOf', 'isSingletonRole', 'resolveProfileDir', 'isLiveEnabled', 'buildLiveSpawnInvocation',\n      'SESSION_BIND_MAX_ATTEMPTS', 'SESSION_BIND_DELAY_MS'];";
if(a.split(oldH).length-1!==1) throw new Error('helper anchor');
fs.writeFileSync('tests/unit/fleet/spawn-control.test.js', a.replace(oldH,newH));

let b=fs.readFileSync('tests/unit/fleet/provision-canary-cli.test.js','utf8');
const oldT=`  it('registration_timeout diagnosis names the STAMP as the suspect, not the spawn', () => {
    // This is the whole value of the CLI: the one permitted live run must yield a diagnosis. A bare
    // timeout looks identical whether the slot was unseeded, the spawn failed, or only the stamp did.
    const d = DIAGNOSIS.registration_timeout;
    expect(d).toMatch(/account_profile/);
    expect(d).toMatch(/stamp/i);
    expect(d).toMatch(/REGISTERED/);
  });`;
const newT=`  it('registration_timeout diagnosis gives an ORDERED procedure grounded in the real failure', () => {
    // Rewritten after the first live run, which is the point: the original text guessed that the stamp
    // was missing because FR-3 had not landed. FR-3 HAD landed; the real cause was the session-bind
    // loop closing 1.3s before the child registered, discarding window_handle, account_profile and the
    // session_id bind together. A diagnosis that names the wrong suspect is worse than a bare timeout,
    // so this now asserts the three ordered checks an operator should actually perform.
    const d = DIAGNOSIS.registration_timeout;
    expect(d).toMatch(/claude_sessions row appear/i);   // (1) did anything register
    expect(d).toMatch(/MINTED session id/i);            // (2) did --session-id take effect
    expect(d).toMatch(/metadata EMPTY/i);               // (3) did the bind window miss
    expect(d).toMatch(/bind/i);
    // Must point at MEASURING the gap rather than re-running blind -- a re-run spawns another session.
    expect(d).toMatch(/measure the gap/i);
  });`;
if(b.split(oldT).length-1!==1) throw new Error('diagnosis anchor');
fs.writeFileSync('tests/unit/fleet/provision-canary-cli.test.js', b.replace(oldT,newT));
console.log('both patched');
