// QF-20260707-875: preventive staleness WARN for routing-critical comms CLIs.
// PREVENTIVE per Alpha's RCA on QF-20260707-652 (closed as stale-code artifact): a
// routing-critical send silently re-ran pre-fix (already-fixed elsewhere) code for
// 1h43m because the checkout was 18 commits behind origin/main, with no signal.
// Deliberately: WARN only, never auto-pull (main checkout is chronically dirty —
// mutating auto-pull is unsafe) and never a hard gate (too aggressive for a warn-class
// issue). Non-fatal on any git error (detached HEAD, no upstream, git unavailable).
const { execSync } = require('child_process');

function warnIfCheckoutStale(label, execImpl = execSync) {
  try {
    const behind = execImpl('git rev-list --count HEAD..@{u}', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const count = parseInt(behind, 10);
    if (count > 0) {
      process.stderr.write(
        `⚠️  WARN: ${label} checkout is ${count} commit(s) behind origin/main — this send may run pre-fix code. Consider a git pull before continuing.\n`
      );
    }
  } catch {
    // No upstream configured, detached HEAD, or git unavailable — never block the send.
  }
}

module.exports = { warnIfCheckoutStale };
