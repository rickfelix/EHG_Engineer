/**
 * Feedback Build Prompt Integration Tests
 * SD: SD-LEO-INFRA-VENTURE-USER-FEEDBACK-001
 *
 * Verifies that /feedback page instructions appear in build prompts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('feedback-build-prompt', () => {
  describe('replit-prompt-formatter.js', () => {
    const formatterPath = join(__dirname, '..', 'lib', 'eva', 'bridge', 'replit-prompt-formatter.js');
    const content = readFileSync(formatterPath, 'utf8');

    it('includes /feedback page section in build instructions', () => {
      assert.ok(content.includes('User Feedback Page (/feedback)'), 'Missing /feedback section header');
    });

    it('includes feedback_type mapping', () => {
      assert.ok(content.includes('user_bug'), 'Missing user_bug type mapping');
      assert.ok(content.includes('user_feature_request'), 'Missing user_feature_request type mapping');
      assert.ok(content.includes('user_usability'), 'Missing user_usability type mapping');
    });

    it('includes Supabase anon key submission pattern', () => {
      assert.ok(content.includes("supabase.from('feedback').insert"), 'Missing Supabase insert pattern');
      assert.ok(content.includes('SUPABASE_ANON_KEY'), 'Missing anon key reference');
    });

    it('includes venture_id in submission', () => {
      assert.ok(content.includes('VENTURE_ID'), 'Missing VENTURE_ID env var reference');
    });

    it('mentions rate limit', () => {
      assert.ok(content.includes('50/hr'), 'Missing rate limit mention');
    });
  });

  describe('replit-format-strategies.js', () => {
    const strategiesPath = join(__dirname, '..', 'lib', 'eva', 'bridge', 'replit-format-strategies.js');
    const content = readFileSync(strategiesPath, 'utf8');

    it('includes /feedback section in replit.md strategy', () => {
      assert.ok(content.includes('User Feedback (/feedback)'), 'Missing /feedback section in replit.md');
    });

    it('includes feedback form fields', () => {
      assert.ok(content.includes('feedback_type'), 'Missing feedback_type field');
      assert.ok(content.includes('Bug Report'), 'Missing Bug Report option');
      assert.ok(content.includes('Feature Request'), 'Missing Feature Request option');
    });

    it('includes Supabase insert example', () => {
      assert.ok(content.includes("supabase.from('feedback').insert"), 'Missing insert example');
    });

    it('includes VITE_VENTURE_ID reference', () => {
      assert.ok(content.includes('VITE_VENTURE_ID'), 'Missing VITE_VENTURE_ID');
    });

    it('documents rate limit', () => {
      assert.ok(content.includes('50 submissions per hour'), 'Missing rate limit documentation');
    });
  });
});
