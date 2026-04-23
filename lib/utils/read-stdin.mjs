/**
 * Cross-platform stdin reader for CLI commands.
 *
 * Windows cmd.exe imposes a ~8K char limit on command-line arguments. Commands
 * that accept large content (markdown documents, JSON blobs) via `--content` hit
 * this limit with anything non-trivial. Stdin piping has no such limit and works
 * identically across Windows, macOS, and Linux.
 *
 * Usage:
 *   import { readStdin } from '../../lib/utils/read-stdin.mjs';
 *   const content = await readStdin();
 *
 * Caller is expected to trigger stdin reads only when opts.stdin is set (or
 * when !process.stdin.isTTY and the caller wants auto-detection). Do NOT read
 * stdin unconditionally — an interactive TTY with no input will hang forever.
 */

export async function readStdin({ timeoutMs = 30000 } = {}) {
  if (process.stdin.isTTY) {
    throw new Error(
      'readStdin() called with stdin attached to a TTY (no piped input). ' +
      'Either pipe content in (e.g. `node script.mjs --stdin < file.md`) or use --content/--source.'
    );
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        reject(new Error(`readStdin timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    process.stdin.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
