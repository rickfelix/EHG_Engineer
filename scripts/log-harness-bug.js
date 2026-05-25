#!/usr/bin/env node
// Log a harness-level bug to the `feedback` table (category='harness_backlog').
// Replaces the deprecated docs/harness-backlog.md append-only log.
//
// SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B (PA-5 refactor): the actual insert
// logic moved to lib/governance/emit-feedback.js so PA-5's capability-suppression
// warning emission can reuse the same dedup-hash pattern. This file is now a
// CLI wrapper.
//
// Usage:
//   node scripts/log-harness-bug.js "<symptom>" [--file <path>] [--sd <sd-key>] [--severity high|medium|low]
//
// Examples:
//   node scripts/log-harness-bug.js "vision-scorer doesn't read quality_checked column"
//   node scripts/log-harness-bug.js "splitPostgreSQLStatements breaks on -- comments" \
//     --file scripts/lib/supabase-connection.js --sd SD-LEO-INFRA-PR-TRACKING-BACKFILL-001
//
// Idempotent: a SHA-256 dedup_hash over (date::symptom::file) prevents duplicate inserts.
// Filter rows: category='harness_backlog' AND status='new' for the open backlog.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { emitFeedback } from '../lib/governance/emit-feedback.js';

/**
 * QF-20260525-785 (RCA CAPA-3): best-effort, NON-BLOCKING scan of origin/main for a likely
 * prior fix of this symptom, so born-stale harness_backlog rows surface a hint at filing time
 * (e.g. filing against a 50-commits-behind tree for something already fixed). Never throws and
 * never blocks the insert — purely advisory. Returns { commit, when, subject, via } or null.
 */
export function findPossiblePriorFix({ symptom, file } = {}) {
  const git = (args) => {
    try {
      return execSync(`git ${args}`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      return '';
    }
  };
  // Only commits within this window count as a meaningful "maybe already fixed" signal —
  // every existing file has *some* last-touching commit, so unbounded matches would be noise.
  const RECENT_DAYS = 21;
  const cutoff = Date.now() - RECENT_DAYS * 864e5;
  const parse = (line, via) => {
    const [hash, iso, ...rest] = (line || '').split('|');
    if (!hash) return null;
    const when = Date.parse(iso);
    if (!Number.isFinite(when) || when < cutoff) return null;
    return { commit: hash, when: iso, subject: rest.join('|'), via };
  };
  try {
    // Source 1: most recent origin/main commit touching the cited file.
    if (file) {
      const hit = parse(git(`log origin/main -n 1 --format="%h|%cI|%s" -- "${file.replace(/"/g, '')}"`), 'file:' + file);
      if (hit) return hit;
    }
    // Source 2: the most distinctive identifier/path token from the symptom, matched (literal,
    // case-insensitive) against recent origin/main commit messages. Cheap vs. full-history pickaxe.
    const token = (symptom || '').match(/[A-Za-z0-9_./-]{8,}/g)?.sort((a, b) => b.length - a.length)[0];
    if (token) {
      const hit = parse(git(`log origin/main -n 1 --format="%h|%cI|%s" -F -i --grep="${token.replace(/"/g, '')}"`), 'keyword:' + token);
      if (hit) return hit;
    }
  } catch {
    /* advisory only — never throw, never block filing */
  }
  return null;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i].startsWith('--')) {
      flags[rawArgs[i].slice(2)] = rawArgs[i + 1];
      i++;
    } else {
      positional.push(rawArgs[i]);
    }
  }

  const symptom = positional[0];
  if (!symptom || flags.help) {
    console.error('Usage: node scripts/log-harness-bug.js "<symptom>" [--file <path>] [--sd <sd-key>] [--severity high|medium|low]');
    process.exitCode = symptom ? 0 : 2;
    return;
  }

  const file = flags.file ?? null;
  const sd = flags.sd ?? null;
  const severity = flags.severity ?? 'medium';

  // QF-20260525-785 (CAPA-3): advisory prior-fix hint — never blocks filing.
  const priorFix = findPossiblePriorFix({ symptom, file });
  if (priorFix) {
    console.warn(`⚠️  possible prior fix on origin/main: ${priorFix.commit} "${priorFix.subject}" (${priorFix.when}, via ${priorFix.via})`);
    console.warn('   Advisory only — filing will proceed. Verify the symptom is still live (e.g. git show origin/main:<file>).');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exitCode = 1;
    return;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const result = await emitFeedback({
      supabase: sb,
      title: symptom,
      description: symptom,
      severity,
      source_type: 'manual_feedback',
      dedup_key: file,
      metadata: {
        logged_via: 'log-harness-bug.js',
        source_location: file,
        deferred_from_sd_key: sd,
        // QF-20260520-436: harness-backlog items are DEFERRED for a future
        // campaign — the surfacing SD did NOT address them. defer_only=true tells
        // lead-final-approval autoCloseFeedback NOT to resolve them when that SD
        // completes (deferred_from_sd_key alone is overloaded: emit-feedback uses
        // it for bundled-CAPA that the SD *does* resolve).
        defer_only: true,
        // QF-20260525-785 (CAPA-3): stamp the advisory prior-fix hint (or null) so a triager
        // can see at a glance whether this row may already be fixed on origin/main.
        possible_prior_fix: priorFix || null,
      },
    });

    if (result.deduped) {
      console.log(`Already logged today: feedback row ${result.id} (no duplicate written)`);
    } else {
      console.log(`Logged harness bug: feedback row ${result.id}`);
      console.log(`  category=harness_backlog status=new severity=${severity}`);
      if (sd) console.log(`  deferred_from_sd_key=${sd}`);
      if (file) console.log(`  source_location=${file}`);
      console.log('\nQuery open backlog:');
      console.log("  category='harness_backlog' AND status='new'");
    }
  } catch (e) {
    console.error('emitFeedback failed:', e.message);
    process.exitCode = 1;
  }
}

// QF-20260525-785: only auto-run when invoked directly (node scripts/log-harness-bug.js ...),
// not when imported for unit testing of findPossiblePriorFix.
const invokedDirectly = (() => {
  try {
    return process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
