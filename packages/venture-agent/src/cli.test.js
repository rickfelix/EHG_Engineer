import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'cli.js');

describe('venture-agent CLI', () => {
  it('should show help with --help', () => {
    const output = execFileSync('node', [CLI, '--help'], { encoding: 'utf8' });
    assert.match(output, /venture-agent/);
    assert.match(output, /poll/);
    assert.match(output, /apply/);
    assert.match(output, /report/);
  });

  it('should show version with --version', () => {
    const output = execFileSync('node', [CLI, '--version'], { encoding: 'utf8' });
    assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('poll should show help', () => {
    const output = execFileSync('node', [CLI, 'poll', '--help'], { encoding: 'utf8' });
    assert.match(output, /--service-id/);
    assert.match(output, /--task-type/);
    assert.match(output, /--limit/);
  });

  it('apply should show help', () => {
    const output = execFileSync('node', [CLI, 'apply', '--help'], { encoding: 'utf8' });
    assert.match(output, /task-id/);
    assert.match(output, /--claimed-by/);
  });

  it('report should show help', () => {
    const output = execFileSync('node', [CLI, 'report', '--help'], { encoding: 'utf8' });
    assert.match(output, /--service-id/);
    assert.match(output, /--since/);
  });

  it('apply should fail without task-id argument', () => {
    try {
      execFileSync('node', [CLI, 'apply'], { encoding: 'utf8', stdio: 'pipe' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.match(err.stderr || err.message, /missing required argument|task-id/i);
    }
  });
});
