/**
 * lib/apa/live-instance-acquisition unit tests
 * SD-LEO-INFRA-APA-PHASE-STANDING-001 (FR-1)
 */

import { describe, it, expect, vi } from 'vitest';
import { acquireLiveInstance } from '../../../lib/apa/live-instance-acquisition.mjs';

function makePlaywrightStub({ status = 200, gotoImpl } = {}) {
  const page = {
    setDefaultTimeout: vi.fn(),
    goto: gotoImpl || vi.fn(async () => ({ status: () => status })),
  };
  const browser = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
  };
  return { chromium: { launch: vi.fn(async () => browser) }, page, browser };
}

describe('FR-1: acquireLiveInstance', () => {
  it('returns ok:true with a live page for a healthy 200 response', async () => {
    const stub = makePlaywrightStub({ status: 200 });
    const result = await acquireLiveInstance('https://example.com', { playwright: stub });
    expect(result.ok).toBe(true);
    expect(result.page).toBe(stub.page);
    await result.teardown();
    expect(stub.browser.close).toHaveBeenCalled();
  });

  it('returns ok:false with an http_ reason for a 4xx/5xx response', async () => {
    const stub = makePlaywrightStub({ status: 502 });
    const result = await acquireLiveInstance('https://broken.example.com', { playwright: stub });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('http_502');
    expect(stub.browser.close).toHaveBeenCalled();
  });

  it('returns ok:false with reason:timeout on a navigation timeout, never throws', async () => {
    const stub = makePlaywrightStub({
      gotoImpl: vi.fn(async () => { throw new Error('Timeout 15000ms exceeded'); }),
    });
    const result = await acquireLiveInstance('https://slow.example.com', { playwright: stub });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('timeout');
  });

  it('returns ok:false without throwing on an invalid url', async () => {
    const result = await acquireLiveInstance('', {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_url');
  });
});

describe('SSRF guard (adversarial review): reject private/loopback/link-local hosts and non-http(s) schemes', () => {
  it('blocks a loopback host before ever launching a browser', async () => {
    const stub = makePlaywrightStub();
    const result = await acquireLiveInstance('http://127.0.0.1:9999/admin', { playwright: stub });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked_host');
    expect(stub.chromium.launch).not.toHaveBeenCalled();
  });

  it('blocks the cloud-metadata link-local address', async () => {
    const stub = makePlaywrightStub();
    const result = await acquireLiveInstance('http://169.254.169.254/latest/meta-data', { playwright: stub });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked_host');
  });

  it('blocks a non-http(s) scheme', async () => {
    const stub = makePlaywrightStub();
    const result = await acquireLiveInstance('file:///etc/passwd', { playwright: stub });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked_scheme');
    expect(stub.chromium.launch).not.toHaveBeenCalled();
  });

  it('allows a normal public https host through to acquisition', async () => {
    const stub = makePlaywrightStub({ status: 200 });
    const result = await acquireLiveInstance('https://example.com', { playwright: stub });
    expect(result.ok).toBe(true);
    expect(stub.chromium.launch).toHaveBeenCalled();
  });
});
