/**
 * QF-20260911-848: CLAUDE_MICHAEL.md section 6 documented `brief-assemble.mjs --inline`,
 * a flag the script does not expose (only --apply, --et-date, --json). Corrected the
 * leo_protocol_sections (section_type=michael_role_contract) row and regenerated the
 * file. This is a targeted regression pin for this fix, not a generic doc-command
 * scanner: it asserts (1) the fabricated flag is gone from the generated file, (2) the
 * corrected invocation is present, and (3) the flag it now documents is a real one that
 * brief-assemble.mjs's own argv parser recognizes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../../../lib/michael/db.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLAUDE_MICHAEL = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE_MICHAEL.md'), 'utf8');

describe('CLAUDE_MICHAEL.md brief-assemble invocation (QF-20260911-848)', () => {
  it('no longer documents the fabricated --inline flag', () => {
    expect(CLAUDE_MICHAEL).not.toContain('brief-assemble.mjs --inline');
  });

  it('documents the corrected --apply invocation', () => {
    expect(CLAUDE_MICHAEL).toContain('brief-assemble.mjs --apply');
  });

  it('the documented --apply flag is real and recognized by brief-assemble.mjs\'s own parser', () => {
    expect(parseArgs(['--apply'])).toMatchObject({ apply: true });
  });
});
