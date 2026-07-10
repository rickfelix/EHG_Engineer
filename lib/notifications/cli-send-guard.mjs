/**
 * QF-20260709-211: send-capable scripts must be flag-strict. Before this, an
 * unrecognized flag (e.g. `--help`) silently fell through to default (send)
 * behavior instead of failing closed — that's how `--help` triggered a real
 * chairman email during the quiet window. `--help`/`-h` now always prints
 * usage and exits 0; any other unrecognized flag exits 1 rather than running.
 *
 * `exit`/`log`/`errorLog` are injectable (default to the real globals) so the
 * guard can be unit tested without killing the test process.
 */
export function enforceCliSendGuard({ scriptName, flags = [], argv = process.argv.slice(2), exit = process.exit, log = console.log, errorLog = console.error }) {
  if (argv.includes('--help') || argv.includes('-h')) {
    const usage = flags.map((f) => `[${f.name}${f.takesValue ? ' <value>' : ''}]`).join(' ');
    log(`Usage: node ${scriptName} ${usage}`);
    return exit(0);
  }
  const known = new Set(flags.map((f) => f.name));
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('-')) continue;
    if (!known.has(tok)) {
      errorLog(`Unknown flag: ${tok}. Run with --help for usage. Refusing to run (fail-closed for a send-capable script).`);
      return exit(1);
    }
    if (flags.find((f) => f.name === tok)?.takesValue) i++;
  }
}
