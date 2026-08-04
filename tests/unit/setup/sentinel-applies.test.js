/**
 * The sentinel actually lands — SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 (FR-1).
 *
 * This asserts on the RUNTIME ENVIRONMENT the unit tier hands to its tests, not on the source of
 * tests/setup.unit.js. That is deliberate and mechanical: setup.unit.js is comment-heavy and its
 * comments necessarily quote the very pattern (`||=`) this SD removed, so any substring assertion
 * over that file would match the prose explaining the fix rather than the code implementing it.
 * The immediately preceding SD had that exact trap fire five times, the fifth inside the fix for
 * the fourth. Reading process.env cannot be fooled by a comment.
 *
 * ON ITS OWN THIS FILE IS WEAK, and the weakness is worth naming: on a machine with no ambient
 * credentials the assertions below pass whether the assignment is `=` or `||=`, because there is
 * nothing for `||=` to prefer. It is the credential-injecting spawn in
 * credential-fence-ordering.spawn.test.js that makes these assertions decisive — that harness runs
 * this file in a child process with real-shaped credentials exported, which is the only condition
 * under which `=` and `||=` produce different results.
 */
import { describe, it, expect } from 'vitest';
import { REQUIRED_SENTINELS } from '../../helpers/credential-fence.js';

describe('unit tier credential sentinel', () => {
  it.each(Object.entries(REQUIRED_SENTINELS))(
    'has replaced %s with the sentinel by the time a test body runs',
    (key, expected) => {
      expect(process.env[key]).toBe(expected);
    },
  );

  it('holds no live Supabase project ref in any credential variable', () => {
    // Independent of the exact sentinel values: whatever the tier holds, it must not resolve to a
    // real project. Catches a future sentinel that is changed to something reachable.
    for (const key of Object.keys(REQUIRED_SENTINELS)) {
      expect(String(process.env[key] ?? '')).not.toMatch(/\.supabase\.(co|in)\b/i);
    }
  });
});
