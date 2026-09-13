/**
 * SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001 FR-2/FR-3: read-only post-lookup methods
 * on the Bluesky and X adapters. Mocked HTTP status only -- never a live API call
 * (neither adapter had any test coverage before this SD; TR-7 adds an options.fetchImpl
 * DI seam specifically so these tests never touch global.fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import { BlueskyAdapter } from '../../../lib/marketing/publisher/adapters/bluesky.js';
import { XAdapter } from '../../../lib/marketing/publisher/adapters/x.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  };
}

describe('BlueskyAdapter.getPostRecord', () => {
  it('classifies exists:true on a 200 response with a valid record', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/rkey', value: {} }));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(true);
    expect(result.transient).toBe(false);
  });

  it('classifies exists:false (deletedOrErrored) on a 404 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(false);
    expect(result.transient).toBe(false);
  });

  it('classifies transient (neither exists nor deletedOrErrored) on a 500 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  it('classifies transient on a network error, never throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  it('classifies transient on a malformed/unparseable postUri', async () => {
    const fetchImpl = vi.fn();
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('dry-run-1700000000');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // TESTING finding (EXEC phase, HIGH): AT Protocol XRPC returns a not-found record as
  // HTTP 400 with {error:'RecordNotFound'}, not a plain 404 -- without this, 'reverted'
  // was unreachable on this path and a deleted post stayed 'unknown' forever.
  it("classifies exists:false on a 400 response with {error:'RecordNotFound'} (the real AT Proto shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'RecordNotFound', message: 'Could not locate record' }));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(false);
    expect(result.transient).toBe(false);
  });

  it('classifies transient (never exists:true) on a 200 response with no uri (positive evidence required)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = new BlueskyAdapter({ fetchImpl });
    const result = await adapter.getPostRecord('at://did:plc:abc/app.bsky.feed.post/rkey');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });
});

describe('XAdapter.getTweet', () => {
  it('classifies exists:true on a 200 response with a valid tweet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: '123' } }));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(true);
    expect(result.transient).toBe(false);
  });

  it('classifies exists:false on a 404 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(false);
    expect(result.transient).toBe(false);
  });

  // SECURITY finding SEC-1: a manufactured/malformed external_post_id (only reachable via
  // a DB write or a compromised X response, never from content-generator.js) must never be
  // interpolated raw into the URL path -- a value like '../../2/users/me' would issue a
  // bearer-authenticated request to a DIFFERENT endpoint, whose 200 would misclassify
  // exists:true and manufacture false graduation credit. Real X tweet ids are digit-only.
  it('classifies transient (never exists:true) on a non-numeric tweetId, without making any request', async () => {
    const fetchImpl = vi.fn();
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('../../2/users/me');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies transient on a 429 rate-limit response, never a terminal outcome', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  it('classifies transient on a 500 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  it('classifies transient on a network error, never throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  // TESTING finding (EXEC phase, CRITICAL): HTTP-ok alone was asserted as exists:true
  // without inspecting the payload. X API v2 GET /2/tweets/:id returns HTTP 200 WITH an
  // errors[] array and NO data key for a deleted/unavailable tweet -- the prior code wrote
  // a deleted post to the ledger as shipped_clean, a wrong TERMINAL write that could earn
  // autonomy graduation from a post that no longer exists.
  it('classifies exists:false (never shipped_clean) on a 200 response with an errors[] array and no data key (the real X not-found shape)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      errors: [{ title: 'Not Found Error', detail: 'Could not find tweet with ids: [123].', type: 'https://api.twitter.com/2/problems/resource-not-found' }]
    }));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(false);
    expect(result.transient).toBe(false);
  });

  it('classifies transient (never exists:true) on a 200 response with neither data nor errors (never guess on an unexpected shape)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });

  it('classifies transient (never exists:true) on a 200 response with an unparseable body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error('invalid JSON')) });
    const adapter = new XAdapter({ fetchImpl, accessToken: 'tok' });
    const result = await adapter.getTweet('123');
    expect(result.exists).toBe(null);
    expect(result.transient).toBe(true);
  });
});
