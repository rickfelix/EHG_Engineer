/**
 * Sentry Integration Hardening Tests
 * SD-LEO-INFRA-SENTRY-INTEGRATION-HARDENING-001
 *
 * Tests framework-conditional SDK selection, PII scrubbing boilerplate,
 * VITE_SENTRY_DSN provisioning, and zero-error health monitoring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read the source files to verify prompt template content
const promptFormatterPath = resolve(import.meta.dirname, '../../../../lib/eva/bridge/replit-prompt-formatter.js');
const formatStrategiesPath = resolve(import.meta.dirname, '../../../../lib/eva/bridge/replit-format-strategies.js');
const pollErrorsPath = resolve(import.meta.dirname, '../../../../scripts/factory/poll-errors.js');
const docGenPath = resolve(import.meta.dirname, '../../../../lib/eva/bridge/documentation-generator.js');
const provisionerPath = resolve(import.meta.dirname, '../../../../lib/eva/bridge/venture-provisioner.js');

const promptFormatter = readFileSync(promptFormatterPath, 'utf-8');
const formatStrategies = readFileSync(formatStrategiesPath, 'utf-8');
const pollErrors = readFileSync(pollErrorsPath, 'utf-8');
const docGen = readFileSync(docGenPath, 'utf-8');
const provisioner = readFileSync(provisionerPath, 'utf-8');

describe('FR-1: Framework-Conditional SDK Selection', () => {
  it('replit-prompt-formatter includes @sentry/node for Express', () => {
    expect(promptFormatter).toContain("@sentry/node");
    expect(promptFormatter).toContain("process.env.SENTRY_DSN");
  });

  it('replit-prompt-formatter includes @sentry/react for React/Vite', () => {
    expect(promptFormatter).toContain("@sentry/react");
    expect(promptFormatter).toContain("VITE_SENTRY_DSN");
    expect(promptFormatter).toContain("ErrorBoundary");
  });

  it('replit-prompt-formatter includes Next.js setup instructions', () => {
    expect(promptFormatter).toContain("@sentry/wizard");
    expect(promptFormatter).toContain("nextjs");
    expect(promptFormatter).toContain("sentry.server.config");
  });

  it('replit-format-strategies has framework-conditional logic', () => {
    expect(formatStrategies).toContain("isVite");
    expect(formatStrategies).toContain("isNextjs");
    expect(formatStrategies).toContain("@sentry/react");
    expect(formatStrategies).toContain("@sentry/wizard");
    expect(formatStrategies).toContain("@sentry/node");
  });
});

describe('FR-2: beforeSend PII Scrubbing', () => {
  it('prompt-formatter includes beforeSend callback', () => {
    expect(promptFormatter).toContain("beforeSend");
  });

  it('beforeSend strips Authorization headers', () => {
    expect(promptFormatter).toContain("delete event.request.headers['authorization']");
  });

  it('beforeSend strips Cookie headers', () => {
    expect(promptFormatter).toContain("delete event.request.headers['cookie']");
  });

  it('beforeSend strips request body', () => {
    expect(promptFormatter).toContain("delete event.request.data");
  });

  it('beforeSend strips cookies', () => {
    expect(promptFormatter).toContain("delete event.request.cookies");
  });

  it('format-strategies also includes PII scrubbing for Node/Express', () => {
    expect(formatStrategies).toContain("beforeSend");
    expect(formatStrategies).toContain("delete event.request.cookies");
  });
});

describe('FR-3: VITE_SENTRY_DSN Environment Variable', () => {
  it('prompt-formatter references VITE_SENTRY_DSN for Vite apps', () => {
    expect(promptFormatter).toContain("VITE_SENTRY_DSN");
  });

  it('format-strategies references VITE_SENTRY_DSN for Vite apps', () => {
    expect(formatStrategies).toContain("VITE_SENTRY_DSN");
  });

  it('documentation-generator recognizes VITE_SENTRY_DSN pattern', () => {
    expect(docGen).toContain("VITE_SENTRY_DSN");
    expect(docGen).toContain("Vite client-side");
  });

  it('venture-provisioner stores vite_dsn', () => {
    expect(provisioner).toContain("vite_dsn");
    expect(provisioner).toContain("VITE_SENTRY_DSN");
  });
});

describe('FR-4: Graceful Shutdown via Sentry.close', () => {
  it('prompt-formatter includes SIGTERM handler', () => {
    expect(promptFormatter).toContain("SIGTERM");
    expect(promptFormatter).toContain("Sentry.close(2000)");
  });

  it('format-strategies includes SIGTERM handler for Node/Express', () => {
    expect(formatStrategies).toContain("SIGTERM");
    expect(formatStrategies).toContain("Sentry.close(2000)");
  });
});

describe('FR-5: Explicit tracesSampleRate', () => {
  it('prompt-formatter sets tracesSampleRate: 0.1', () => {
    expect(promptFormatter).toContain("tracesSampleRate: 0.1");
  });

  it('format-strategies sets tracesSampleRate: 0.1', () => {
    expect(formatStrategies).toContain("tracesSampleRate: 0.1");
  });

  it('prompt-formatter explains free tier cost governance', () => {
    expect(promptFormatter).toContain("free tier cost");
  });
});

describe('FR-6: Zero-Error Health Monitoring', () => {
  it('poll-errors tracks consecutive_zero_error_count', () => {
    expect(pollErrors).toContain("consecutive_zero_error_count");
  });

  it('poll-errors flags potentially_broken_sdk', () => {
    expect(pollErrors).toContain("potentially_broken_sdk");
  });

  it('poll-errors resets count when errors received', () => {
    expect(pollErrors).toContain("consecutive_zero_error_count = 0");
  });

  it('poll-errors uses configurable threshold from env', () => {
    expect(pollErrors).toContain("SENTRY_ZERO_ERROR_THRESHOLD");
  });

  it('poll-errors includes suspected broken SDK summary', () => {
    expect(pollErrors).toContain("Suspected Broken SDKs");
  });
});

describe('TR-1: Backward Compatibility', () => {
  it('format-strategies defaults to @sentry/node for unknown frameworks', () => {
    // The else branch handles non-Vite, non-Next.js cases (defaults to Node)
    expect(formatStrategies).toContain("Setup (Node.js/Express)");
  });
});
