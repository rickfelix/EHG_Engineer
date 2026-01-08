#!/usr/bin/env node
/**
 * LEO Continuous Mode Prompt Generator
 *
 * Outputs a copy-paste prompt to give any Claude Code instance
 * for continuous autonomous SD execution.
 *
 * Usage:
 *   npm run leo:prompt
 *   node scripts/leo-continuous-prompt.js
 *   node scripts/leo-continuous-prompt.js --short
 */

const args = process.argv.slice(2);
const isShort = args.includes('--short') || args.includes('-s');

const SHORT_PROMPT = `
╔══════════════════════════════════════════════════════════════════╗
║                 LEO CONTINUOUS MODE PROMPT (SHORT)               ║
╠══════════════════════════════════════════════════════════════════╣
║  Copy everything between the dashed lines:                       ║
╚══════════════════════════════════════════════════════════════════╝

--------------------------------------------------------------------------------
Continuous mode: After each SD completes, auto-proceed to next via \`npm run sd:next\`.
No confirmation needed. Follow LEO Protocol (LEAD→PLAN→EXEC).

QUALITY OVER SPEED: Fix root causes, never work around issues.

ON FAILURE - Progressive Escalation (max 20 min total):
1. First failure → Run /escalate Level 2 (5-Whys diagnosis via explorer agent)
2. If quick fix found (<10 min) → Attempt fix, retry
3. If fix fails → Run /escalate Level 4 (deeper 5-Whys)
4. Still failing → Skip with intelligence (log findings, create backlog item)

NEVER ask user what to do. Diagnose → Fix → Retry → Skip. Always log learnings.
Continue until I say stop.
--------------------------------------------------------------------------------
`;

const FULL_PROMPT = `
╔══════════════════════════════════════════════════════════════════╗
║                  LEO CONTINUOUS MODE PROMPT                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Copy everything between the dashed lines and paste into         ║
║  any Claude Code instance to enable continuous execution.        ║
╚══════════════════════════════════════════════════════════════════╝

--------------------------------------------------------------------------------
## Continuous LEO Protocol Mode

You are now in **continuous execution mode**. Follow these rules:

### After Completing Any SD:
1. Run \`npm run sd:next\` to identify the next READY SD
2. Immediately proceed without asking for confirmation
3. Follow LEO Protocol: LEAD → PLAN → EXEC for each SD

### Quality Over Speed - Root Cause Focus:
**CRITICAL: Fix root causes, never work around issues.**

- When encountering a problem, identify and fix the ROOT CAUSE
- Do NOT create workarounds that leave the underlying issue unfixed
- If a script doesn't read data correctly, fix the script (not the data storage)
- If validation fails, fix the validation logic (not bypass it)
- Quality is more important than speed - take time to do it right

### On Failure - Progressive Escalation (/escalate pattern):
**NEVER ask user what to do. Follow this escalation automatically:**

| Level | Action | Time Budget |
|-------|--------|-------------|
| 1 | Initial failure occurs | - |
| 2 | **5-Whys Diagnosis**: Launch explorer agent to ask 5 progressive "why" questions | 3 min |
| 3 | **Targeted Fix**: If quick fix found (<10 min effort), implement and retry | 10 min |
| 4 | **Deeper 5-Whys**: If fix failed, launch deeper explorer analysis | 3 min |
| 5 | **Intelligent Skip**: Log findings, create backlog item, tag pattern, move to next SD | - |

**5-Whys Questions (Level 2):**
1. What specifically failed?
2. Why did that component fail?
3. Why is that missing/wrong?
4. Why wasn't it caught earlier?
5. What's the root cause pattern?

**On Skip (Level 5), always:**
- Log detailed findings to database
- Create backlog item if warranted
- Tag as pattern for future learning
- Then immediately proceed to next SD

### Checkpoints:
- Re-read CLAUDE.md at each phase transition
- Validate work against LEO requirements
- Use sub-agents per their trigger keywords

### Continue Until:
- Baseline is exhausted (no more READY SDs)
- I explicitly say "stop" or "pause"
- (NOT for human decisions - diagnose and fix or skip)

### Current Session Commands:
- \`npm run sd:next\` - Get next SD
- \`npm run sd:status\` - View progress
- \`/escalate\` - Manual escalation skill (auto-triggered on failure)

Start now by checking the current SD status or proceeding to the next phase.
--------------------------------------------------------------------------------
`;

console.log(isShort ? SHORT_PROMPT : FULL_PROMPT);

if (!isShort) {
  console.log(`
TIP: Use --short or -s for a shorter version:
  npm run leo:prompt -- --short
`);
}
