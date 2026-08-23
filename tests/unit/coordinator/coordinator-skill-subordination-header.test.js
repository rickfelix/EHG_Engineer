/**
 * SD-LEO-INFRA-COORDINATOR-ROLE-CONTRACT-002 (FR-3, AC-1).
 *
 * Both the /coordinator skill (.claude/commands/coordinator.md) and the behavior doc
 * (docs/protocol/fleet-coordinator-and-worker-behavior.md) must carry a machine-checkable
 * subordination header naming CLAUDE_COORDINATOR.md as the canonical charter, so a future edit
 * that quietly drops the subordination language is caught here rather than discovered as a
 * two-org-charts divergence.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const FILES = [
  '.claude/commands/coordinator.md',
  'docs/protocol/fleet-coordinator-and-worker-behavior.md',
];

describe('coordinator skill + behavior doc carry a subordination header (FR-3)', () => {
  it.each(FILES)('%s declares itself SUBORDINATE to CLAUDE_COORDINATOR.md', (relPath) => {
    const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    expect(text).toMatch(/SUBORDINATE to the DB-generated charter/);
    expect(text).toContain('CLAUDE_COORDINATOR.md');
  });
});
