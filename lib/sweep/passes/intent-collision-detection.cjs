// SD-ARCH-HOTSPOT-SWEEP-001: extracted from scripts/stale-session-sweep.cjs main()
// step "4a-2" (was lines ~1889-1919). ADDITIVE to the dup-claim and WORKTREE_CONFLICT
// logic left inline in main() — unchanged by this extraction.
//
// Reads broadcast INTENT rows (payload.intent_action) and flags when a destructive
// intent (e.g. cancel-tree) targets an SD/branch/files a DIFFERENT live session is
// actively holding. Runs post-classification (needs ctx.classified). Surfaces
// collisions on ctx.collisionsDetected (main()'s real return value,
// sweepResult.collisions) AND prominent stdout — never a silently-swallowed
// console-only warning. Gated by CROSS_SESSION_DECONFLICTION=true.
//
// CIRCULAR-REQUIRE NOTE: stale-session-sweep.cjs's `if (require.main === module) main()`
// guard calls main() BEFORE its own trailing `module.exports.X = ...` lines run (main()
// is async and yields at its first await, so JS falls through to those export lines
// immediately after the main() call expression, not after main() resolves). If this file
// destructured {loadRecentIntents, detectCrossSessionCollisions} AT REQUIRE TIME, and that
// require happened during main()'s synchronous prelude (before its first await), it would
// capture `undefined` permanently. Requiring the whole module object and reading properties
// LAZILY inside run() (called well after main()'s first several awaits, by which point the
// exports have long since been assigned) avoids the race.
const sweepModule = require('../../../scripts/stale-session-sweep.cjs');

const DECONFLICTION_ENABLED = process.env.CROSS_SESSION_DECONFLICTION === 'true';
const INTENT_WINDOW_MIN = Number(process.env.CROSS_SESSION_INTENT_WINDOW_MIN) || 24 * 60;

async function run(ctx) {
  if (!DECONFLICTION_ENABLED) return;
  const { supabase, classified, warnings, collisionsDetected } = ctx;

  try {
    const { rows: intentRows, error: intentErr } = await sweepModule.loadRecentIntents(supabase, INTENT_WINDOW_MIN);
    if (intentErr) {
      console.log('INTENT_COLLISION: load error=' + (intentErr.message || 'unknown'));
      return;
    }
    const found = sweepModule.detectCrossSessionCollisions(classified, intentRows);
    if (collisionsDetected) collisionsDetected.push(...found);
    if (found.length > 0) {
      console.log('');
      console.log('!!! CROSS-SESSION INTENT COLLISION(S): ' + found.length + ' !!!');
      for (const c of found) {
        const line = 'INTENT_COLLISION: ' + c.intent_action +
          ' from ' + (c.sender_session || '?') +
          ' targets ' + (c.target_sd_key || c.target_tree || '?') +
          ' — collides with live session ' + c.collided_with_session +
          ' (' + c.reasons.join(', ') + ')';
        console.log('  ' + line);
        warnings.push(line);
      }
    }
  } catch (collErr) {
    console.log('INTENT_COLLISION: ' + (collErr && collErr.message ? collErr.message : 'unknown'));
  }
}

module.exports = { name: 'intent-collision-detection', run };
