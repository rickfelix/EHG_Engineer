// ENF-18 pure command-parsing seam (QF-20260902-542). No top-level side effects — safe to
// require directly from tests, unlike pre-tool-enforce.cjs (blocks on its own stdin read).

/**
 * Does `command` invoke `handoff.js execute TYPE SD-ID`? Requires the literal word
 * "execute" so `handoff.js precheck ...` (this guard's remediation target) never matches.
 * @returns {{handoffType: string, sdId: string}|null}
 */
function parseHandoffExecuteCall(command) {
  const m = String(command || '').match(/handoff\.js\s+execute\s+(\S+)\s+(\S+)/);
  return m ? { handoffType: m[1].toUpperCase(), sdId: m[2] } : null;
}

module.exports = { parseHandoffExecuteCall };
