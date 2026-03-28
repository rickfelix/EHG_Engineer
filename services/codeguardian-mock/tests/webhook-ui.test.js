import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'ui', 'webhooks.html'), 'utf-8');

describe('Webhook UI - webhooks.html', () => {
  it('exists and is valid HTML', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('has correct page title', () => {
    expect(html).toContain('<title>CodeGuardian CI - Webhooks</title>');
  });

  it('includes navigation with Webhooks link active', () => {
    expect(html).toContain('href="webhooks.html" class="active"');
    expect(html).toContain('href="dashboard.html"');
    expect(html).toContain('href="results.html"');
  });

  it('includes stats metrics section', () => {
    expect(html).toContain('id="stats"');
  });

  it('includes deliveries table with correct headers', () => {
    expect(html).toContain('id="deliveries-body"');
    expect(html).toContain('Delivery ID');
    expect(html).toContain('Event Type');
    expect(html).toContain('Signature');
    expect(html).toContain('Processed');
  });

  it('includes pipeline runs table', () => {
    expect(html).toContain('id="runs-body"');
    expect(html).toContain('Run ID');
    expect(html).toContain('Repository');
    expect(html).toContain('Workflow');
    expect(html).toContain('Status');
    expect(html).toContain('Conclusion');
  });

  it('includes event type filter dropdown', () => {
    expect(html).toContain('id="filter-type"');
    expect(html).toContain('value="push"');
    expect(html).toContain('value="pull_request"');
    expect(html).toContain('value="workflow_run"');
  });

  it('includes pagination controls', () => {
    expect(html).toContain('id="btn-prev"');
    expect(html).toContain('id="btn-next"');
    expect(html).toContain('id="page-info"');
  });

  it('imports webhook-repository and webhook-seed modules', () => {
    expect(html).toContain("from '../src/data/webhook-repository.js'");
    expect(html).toContain("from '../src/data/webhook-seed.js'");
  });

  it('links to shared stylesheet', () => {
    expect(html).toContain('href="css/styles.css"');
  });

  it('uses ES module script type', () => {
    expect(html).toContain('type="module"');
  });
});
