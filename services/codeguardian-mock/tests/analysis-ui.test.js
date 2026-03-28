import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'ui', 'analysis.html'), 'utf-8');

describe('Analysis UI - analysis.html', () => {
  it('is valid HTML', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('has correct page title', () => {
    expect(html).toContain('<title>CodeGuardian CI - Analysis Results</title>');
  });

  it('includes navigation with Analysis link active', () => {
    expect(html).toContain('href="analysis.html" class="active"');
    expect(html).toContain('href="dashboard.html"');
    expect(html).toContain('href="webhooks.html"');
  });

  it('includes stats section', () => {
    expect(html).toContain('id="stats"');
  });

  it('includes analyses table', () => {
    expect(html).toContain('id="analyses-body"');
    expect(html).toContain('Repository');
    expect(html).toContain('Quality');
  });

  it('includes findings table with severity filter', () => {
    expect(html).toContain('id="findings-body"');
    expect(html).toContain('id="filter-severity"');
    expect(html).toContain('value="critical"');
    expect(html).toContain('Severity');
    expect(html).toContain('Rule');
  });

  it('includes metrics table with threshold and status', () => {
    expect(html).toContain('id="metrics-body"');
    expect(html).toContain('Threshold');
    expect(html).toContain('Status');
  });

  it('imports analysis-repository and analysis-seed', () => {
    expect(html).toContain("from '../src/data/analysis-repository.js'");
    expect(html).toContain("from '../src/data/analysis-seed.js'");
  });

  it('uses ES module script type and shared stylesheet', () => {
    expect(html).toContain('type="module"');
    expect(html).toContain('href="css/styles.css"');
  });
});
