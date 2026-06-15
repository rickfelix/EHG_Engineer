'use strict';
/**
 * sd-executable-here.cjs — SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-1)
 *
 * One reusable predicate that answers "can a fleet worker actually execute this SD HERE/NOW?"
 * BEFORE it commits a claim — eliminating the recurring unfit-assignment churn (live: worker Alpha
 * claimed an SD targeting the EHG app from an EHG_Engineer checkout, then an SD whose run-input data
 * file was absent, then an already-released SD). It COMPOSES existing primitives (it does NOT
 * reimplement repo resolution, terminal-status, or eligibility):
 *   - repo-match     : normalizeAppName (same trivial rule as lib/repo-paths.js) — positive
 *                      target-vs-checkout mismatch only.
 *   - premise-open   : REUSES lib/coordinator/claimable-work.cjs TERMINAL_STATUSES (+ superseded/
 *                      released/handled metadata flags).
 *   - preconditions  : declared input-data preconditions (metadata.preconditions) probed against the
 *                      checkout (injectable probe; default = fs.existsSync for {type:'file'}).
 *
 * INVARIANT — FAIL OPEN. A fitness bug must NEVER block all claims (fleet-wide stall). Any internal
 * error, any indeterminate signal, and an absent/ambiguous target_application all yield fit:true.
 * Only a POSITIVELY-determined unfit condition returns fit:false. Pure + injectable (cwd, probe,
 * terminalStatuses all overridable) so it is unit-testable with no live DB and no real filesystem.
 */
const path = require('path');
const fs = require('fs');

let TERMINAL_STATUSES;
try { ({ TERMINAL_STATUSES } = require('../coordinator/claimable-work.cjs')); }
catch { TERMINAL_STATUSES = Object.freeze(['completed', 'cancelled', 'archived', 'deferred']); }

/** Same normalization rule as lib/repo-paths.js normalizeAppName (inlined to keep this CJS module
 *  free of the ESM repo-paths import; 'EHG_Engineer' -> 'ehgengineer', 'ehg' -> 'ehg'). */
function normalizeAppName(name) {
  return String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Resolve the current checkout's app identity from a cwd: strip any /.worktrees/<sd> suffix, take
 *  the repo-root basename, normalize. Returns '' when indeterminate (=> repo check is skipped). */
function appOfCwd(cwd) {
  const p = String(cwd == null ? '' : cwd).replace(/\\/g, '/').replace(/\/\.worktrees\/[^/]+.*$/, '').replace(/\/+$/, '');
  const base = p.split('/').filter(Boolean).pop() || '';
  return normalizeAppName(base);
}

function unfit(blockClass, reason) { return { fit: false, blockClass, reasons: [reason] }; }
function fit(reason) { return { fit: true, blockClass: null, reasons: reason ? [reason] : [] }; }

/**
 * @param {{sd_key?:string, target_application?:string, status?:string, metadata?:object}} sd
 * @param {{cwd?:string, currentApp?:string, repoRoot?:string, terminalStatuses?:string[], preconditionProbe?:Function}} [ctx]
 * @returns {{fit:boolean, blockClass:('repo_mismatch'|'missing_precondition'|'premise_closed'|null), reasons:string[]}}
 */
function isSdExecutableHere(sd, ctx = {}) {
  try {
    const row = sd || {};
    const md = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
    const terminal = Array.isArray(ctx.terminalStatuses) ? ctx.terminalStatuses : TERMINAL_STATUSES;

    // 1. premise-open — a terminal / superseded / released / handled SD is not executable.
    if (row.status && terminal.includes(row.status)) return unfit('premise_closed', `status='${row.status}' is terminal`);
    if (md.superseded === true || md.released === true || md.handled === true) {
      return unfit('premise_closed', 'metadata marks the premise superseded/released/handled');
    }

    // 2. repo-match — POSITIVE target-vs-checkout mismatch only. Absent/ambiguous target => fit.
    const target = normalizeAppName(row.target_application);
    if (target) {
      const current = ctx.currentApp ? normalizeAppName(ctx.currentApp) : appOfCwd(ctx.cwd || process.cwd());
      if (current && target !== current) {
        return unfit('repo_mismatch', `SD targets '${row.target_application}' but checkout is '${current}'`);
      }
    }

    // 3. preconditions — declared input-data requirements must be present in the checkout.
    const pres = Array.isArray(md.preconditions) ? md.preconditions : [];
    if (pres.length) {
      const probe = typeof ctx.preconditionProbe === 'function'
        ? ctx.preconditionProbe
        : (pc) => {
            try {
              if (pc && pc.type === 'file' && pc.path) {
                return fs.existsSync(path.resolve(ctx.repoRoot || process.cwd(), String(pc.path)));
              }
              return true; // unknown precondition type => treat as met (fail-open)
            } catch { return true; }
          };
      for (const pc of pres) {
        let met = true;
        try { met = probe(pc) !== false; } catch { met = true; } // probe error => met (fail-open)
        if (!met) return unfit('missing_precondition', `precondition unmet: ${JSON.stringify(pc)}`);
      }
    }

    return fit();
  } catch (e) {
    // FAIL OPEN: a predicate fault must never block a claim.
    return { fit: true, blockClass: null, reasons: [`fail-open: ${e && e.message ? e.message : String(e)}`] };
  }
}

module.exports = { isSdExecutableHere, normalizeAppName, appOfCwd };
