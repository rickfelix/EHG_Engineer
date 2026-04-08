import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCriticalFindings, runReview, evaluateFindings, parseReviewFindings, buildReviewPrompt, buildAdversarialPrompt, evaluateAdversarialFindings } from '../lib/ship/review-gate.js';

describe('review-gate', () => {
  describe('checkCriticalFindings', () => {
    it('detects hardcoded secret patterns', () => {
      const diff = '+ const key = "sk-live-abc123def456ghi789jkl012mno345";';
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, true);
      assert.ok(result.findings.some(f => f.name === 'hardcoded_secret'));
    });

    it('detects SQL injection patterns', () => {
      const diff = '+ db.query(`SELECT * FROM users WHERE id = ${userId}`)';
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, true);
      assert.ok(result.findings.some(f => f.name === 'sql_injection'));
    });

    it('detects destructive schema operations', () => {
      const diff = '+ DROP TABLE users;';
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, true);
      assert.ok(result.findings.some(f => f.name === 'schema_corruption'));
    });

    it('allows DROP TABLE IF EXISTS', () => {
      const diff = '+ DROP TABLE IF EXISTS temp_staging;';
      const result = checkCriticalFindings(diff);
      const schemaFindings = result.findings.filter(f => f.name === 'schema_corruption');
      assert.equal(schemaFindings.length, 0);
    });

    it('detects service role exposure in client code', () => {
      const diff = '+ NEXT_PUBLIC_SERVICE_ROLE_KEY=xyz';
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, true);
      assert.ok(result.findings.some(f => f.name === 'service_role_exposure'));
    });

    it('returns clean for safe diff', () => {
      const diff = `+ console.log('hello world');
+ const x = 42;
+ export function add(a, b) { return a + b; }`;
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, false);
      assert.equal(result.findings.length, 0);
    });

    it('logs categories not code excerpts (CISO requirement)', () => {
      const diff = '+ const secret = "sk-live-realSecretValue123456789";';
      const result = checkCriticalFindings(diff);
      assert.equal(result.found, true);
      // Verify no actual secret value in the finding matches
      for (const finding of result.findings) {
        for (const match of finding.matches) {
          assert.ok(!match.includes('realSecretValue'), 'Finding should not contain actual secret values');
          assert.ok(match.includes('pattern detected'), 'Finding should reference pattern category');
        }
      }
    });
  });

  describe('runReview', () => {
    it('blocks immediately on CRITICAL finding regardless of tier', () => {
      const diff = '+ NEXT_PUBLIC_SERVICE_ROLE_KEY=abc123';
      const result = runReview(diff, 'light');
      assert.equal(result.verdict, 'block');
      assert.ok(result.criticalFindings.length > 0);
    });

    it('returns review_needed for clean Light tier diff', () => {
      const diff = '+ const x = 42;';
      const result = runReview(diff, 'light');
      assert.equal(result.verdict, 'review_needed');
      assert.equal(result.tierEnforcement, 'advisory');
      assert.equal(result.multiAgent, false);
      assert.ok(result.reviewPrompt);
    });

    it('returns blocking enforcement for Standard tier', () => {
      const diff = '+ const x = 42;';
      const result = runReview(diff, 'standard');
      assert.equal(result.tierEnforcement, 'blocking');
      assert.equal(result.multiAgent, false);
      assert.ok(result.reviewPrompt);
    });

    it('returns multi-agent adversarial for Deep tier', () => {
      const diff = '+ const x = 42;';
      const result = runReview(diff, 'deep');
      assert.equal(result.verdict, 'review_needed');
      assert.equal(result.tierEnforcement, 'blocking');
      assert.equal(result.multiAgent, true);
      assert.ok(result.adversarialPrompt);
      assert.equal(result.reviewPrompt, null);
    });
  });

  describe('buildReviewPrompt', () => {
    it('includes adversarial framing', () => {
      const prompt = buildReviewPrompt('+ const x = 1;', 'standard');
      assert.ok(prompt.includes('adversarial'));
      assert.ok(prompt.includes('did NOT write this code'));
    });

    it('uses quick framing for light tier', () => {
      const prompt = buildReviewPrompt('+ const x = 1;', 'light');
      assert.ok(prompt.includes('quick'));
    });

    it('truncates long diffs', () => {
      const longDiff = 'x'.repeat(10000);
      const prompt = buildReviewPrompt(longDiff, 'standard');
      assert.ok(prompt.includes('[diff truncated]'));
    });
  });

  describe('evaluateFindings', () => {
    it('CRITICAL findings block even in advisory mode', () => {
      const findings = [{ type: 'CRITICAL', description: 'Auth bypass' }];
      const result = evaluateFindings(findings, 'advisory');
      assert.equal(result.verdict, 'block');
    });

    it('WARNING findings pass in advisory mode', () => {
      const findings = [{ type: 'WARNING', description: 'Missing null check' }];
      const result = evaluateFindings(findings, 'advisory');
      assert.equal(result.verdict, 'pass');
      assert.equal(result.advisoryFindings.length, 1);
    });

    it('WARNING findings block in blocking mode', () => {
      const findings = [{ type: 'WARNING', description: 'Missing null check' }];
      const result = evaluateFindings(findings, 'blocking');
      assert.equal(result.verdict, 'block');
      assert.equal(result.blockingFindings.length, 1);
    });

    it('INFO findings never block', () => {
      const findings = [{ type: 'INFO', description: 'Could use const instead of let' }];
      const result = evaluateFindings(findings, 'blocking');
      assert.equal(result.verdict, 'pass');
    });

    it('empty findings pass', () => {
      const result = evaluateFindings([], 'blocking');
      assert.equal(result.verdict, 'pass');
    });
  });

  describe('parseReviewFindings', () => {
    it('parses valid JSON response', () => {
      const response = '{"findings": [{"type": "WARNING", "description": "Missing check"}], "summary": "One issue"}';
      const result = parseReviewFindings(response);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].type, 'WARNING');
    });

    it('handles JSON embedded in text', () => {
      const response = 'Here is my review:\n{"findings": [], "summary": "Clean code"}\nEnd.';
      const result = parseReviewFindings(response);
      assert.equal(result.findings.length, 0);
      assert.equal(result.summary, 'Clean code');
    });

    it('handles malformed response gracefully', () => {
      const response = 'This is not JSON at all';
      const result = parseReviewFindings(response);
      assert.equal(result.findings.length, 0);
      assert.ok(result.summary.includes('parsing failed'));
    });
  });

  describe('buildAdversarialPrompt', () => {
    it('includes security and correctness focus areas', () => {
      const prompt = buildAdversarialPrompt('+ const x = 1;');
      assert.ok(prompt.includes('SECURITY'));
      assert.ok(prompt.includes('CORRECTNESS'));
      assert.ok(prompt.includes('DATA INTEGRITY'));
    });

    it('includes adversarial framing', () => {
      const prompt = buildAdversarialPrompt('+ const x = 1;');
      assert.ok(prompt.includes('adversarial'));
      assert.ok(prompt.includes('did NOT write this code'));
    });

    it('includes JSON output format', () => {
      const prompt = buildAdversarialPrompt('+ const x = 1;');
      assert.ok(prompt.includes('"findings"'));
      assert.ok(prompt.includes('CRITICAL|WARNING|INFO'));
    });

    it('truncates long diffs at 12000 chars', () => {
      const longDiff = 'x'.repeat(15000);
      const prompt = buildAdversarialPrompt(longDiff);
      assert.ok(prompt.includes('[diff truncated]'));
    });

    it('rejects theoretical issues in instructions', () => {
      const prompt = buildAdversarialPrompt('+ const x = 1;');
      assert.ok(prompt.includes('CONCRETE problems'));
      assert.ok(prompt.includes('Do not manufacture findings'));
    });
  });

  describe('evaluateAdversarialFindings', () => {
    it('hard-fails on null response (agent failure)', () => {
      const result = evaluateAdversarialFindings(null);
      assert.equal(result.verdict, 'block');
      assert.ok(result.reason.includes('agent_failure'));
    });

    it('hard-fails on undefined response', () => {
      const result = evaluateAdversarialFindings(undefined);
      assert.equal(result.verdict, 'block');
      assert.ok(result.reason.includes('agent_failure'));
    });

    it('hard-fails on empty string response', () => {
      const result = evaluateAdversarialFindings('');
      assert.equal(result.verdict, 'block');
      assert.ok(result.reason.includes('agent_failure'));
    });

    it('passes when agent finds no issues', () => {
      const response = '{"findings": [], "summary": "No issues detected"}';
      const result = evaluateAdversarialFindings(response);
      assert.equal(result.verdict, 'pass');
      assert.equal(result.findings.length, 0);
    });

    it('blocks on CRITICAL finding from agent', () => {
      const response = '{"findings": [{"type": "CRITICAL", "description": "Auth bypass", "location": "auth.js:15"}], "summary": "Critical issue"}';
      const result = evaluateAdversarialFindings(response);
      assert.equal(result.verdict, 'block');
      assert.equal(result.findings.length, 1);
    });

    it('blocks on WARNING finding (deep tier is always blocking)', () => {
      const response = '{"findings": [{"type": "WARNING", "description": "Missing null check", "location": "api.js:42"}], "summary": "Warning found"}';
      const result = evaluateAdversarialFindings(response);
      assert.equal(result.verdict, 'block');
    });

    it('passes on INFO-only findings', () => {
      const response = '{"findings": [{"type": "INFO", "description": "Style suggestion"}], "summary": "Minor only"}';
      const result = evaluateAdversarialFindings(response);
      assert.equal(result.verdict, 'pass');
    });
  });
});
