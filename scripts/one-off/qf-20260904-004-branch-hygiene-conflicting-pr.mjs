import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// QF-20260904-004: a worker seat in auto mode cannot complete git push --force-with-lease --
// the Claude Code auto-mode classifier denies it before any repo-side check runs -- so a
// CONFLICTING PR strands until a bypass-permissions seat pushes for it. Adds a new
// "5. When a PR Goes CONFLICTING (Post-Push)" subsection to the Branch Hygiene Gate (id=284,
// CLAUDE_EXEC.md), between "4. Maximum Branch Lifetime" and "Branch Health Check Script".
const ANCHOR = '### Branch Health Check Script';
const NEW_SUBSECTION = `### 5. When a PR Goes CONFLICTING (Post-Push)

QF-20260904-004: \`git push --force-with-lease\` is denied by the Claude Code auto-mode classifier
before any repo-side check runs -- a worker seat cannot complete a REBASE-and-force-push cycle on
its own branch, so a CONFLICTING PR strands until a bypass-permissions seat pushes for it.

**DEFAULT (no force-push ever needed): merge-from-main on the SAME branch.**
\`\`\`bash
git fetch origin main
git merge origin/main   # resolve any conflicts locally, then:
git add -A && git commit
git push   # plain push -- the branch's existing commits are untouched, so this is a fast-forward for origin, never a force-push
\`\`\`
This is why item 3 above ("Merge Main at Phase Transitions") already says \`git merge\`, not
\`rebase\`, as the primary form -- a merge commit is the tradeoff (non-linear branch history), and
it is accepted here specifically because it keeps the worker unblocked without any human seat.

**ESCAPE HATCH (only if a genuine rebase/linear-history is required, or the merge itself cannot
be resolved cleanly): replay as a new branch.**
\`\`\`bash
git rebase origin/main   # resolve conflicts locally
git checkout -b <branch>-r2
git push -u origin <branch>-r2   # plain push of a NEW branch -- never force
gh pr create --title "..." --body "Replaces #<original-PR>, rebased for a clean merge."
gh pr close <original-PR> --comment "Superseded by #<new-PR> (rebased, replay-as-new-branch per QF-20260904-004)"
\`\`\`
The original branch/PR is closed, never force-pushed. Used precedent: PR #8189, #8190.

**Do not attempt** \`git push --force-with-lease\` (or \`--force\`) on an existing branch from a
worker seat -- it is denied by the classifier before any repo check runs, and retrying the
identical command does not change the outcome. If a human operator wants worker seats to
force-push their own \`qf/\`/\`feat/\` branches, that is a Bash permission-rule decision for the
chairman, not something a worker session can grant itself.

${ANCHOR}`;

const { data: row, error: readError } = await supabase
  .from('leo_protocol_sections')
  .select('content')
  .eq('id', 284)
  .single();

if (readError) {
  console.error('READ FAILED:', readError.message);
  process.exit(1);
}

if (row.content.includes('When a PR Goes CONFLICTING')) {
  console.log('Already applied. No-op.');
  process.exit(0);
}

if (!row.content.includes(ANCHOR)) {
  console.error('ANCHOR NOT FOUND — section shape has changed since this script was written.');
  process.exit(1);
}

const newContent = row.content.replace(ANCHOR, NEW_SUBSECTION);

const { error: updateError } = await supabase
  .from('leo_protocol_sections')
  .update({ content: newContent })
  .eq('id', 284);

if (updateError) {
  console.error('UPDATE FAILED:', updateError.message);
  process.exit(1);
}

const { data: verify } = await supabase
  .from('leo_protocol_sections')
  .select('content')
  .eq('id', 284)
  .single();

console.log('Updated. Contains new subsection:', verify.content.includes('When a PR Goes CONFLICTING'));
console.log('Anchor still present (not duplicated/lost):', verify.content.includes(ANCHOR));
