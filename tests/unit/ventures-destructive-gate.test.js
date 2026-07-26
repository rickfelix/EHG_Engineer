/**
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1 — the gate is WIRED, on BOTH mounts.
 *
 * tests/unit/destructive-confirmation.test.js proves the gate LOGIC is correct. That is
 * not the same as proving it runs: deleting any one of the three `evaluateConfirmation`
 * call sites in server/routes/ventures.js would leave every one of those tests green
 * while re-opening the exact hole this SD exists to close. This file tests the invariant
 * at the call sites.
 *
 * SAFETY: lib/deleteVentureFully.js is mocked, so the real teardown can never run. Every
 * refusal assertion also asserts the mock was invoked ZERO times — which doubles as a
 * detector for accidental real invocation. No server is booted, no socket is opened, and
 * no Supabase client is constructed: the route module resolves its client from
 * req.app.locals.supabase, so the stub below is the only client in play.
 *
 * Deliberately NOT modelled on tests/integration/webhooks/webhook-routes-mounted.test.js,
 * which boots the real server as a child process with real credentials. Against these
 * routes that pattern is one copy-paste away from deleting 148 live ventures.
 *
 * DUAL MOUNT: server/index.js:191 and :192 mount the SAME router object at
 * /api/ventures and /api/competitor-analysis. Calling a handler function twice would
 * prove nothing about that, so this builds a real express app wiring BOTH app.use lines
 * and drives requests through app.handle() — routing is exercised, no socket is bound.
 * (supertest is not a dependency in this repo.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { IncomingMessage, ServerResponse } from 'node:http';

const deleteVentureFullyMock = vi.fn(async id => ({ success: true, venture: { id }, phases: {} }));
vi.mock('../../lib/deleteVentureFully.js', () => ({
  deleteVentureFully: (...args) => deleteVentureFullyMock(...args),
}));
vi.mock('../../server/config.js', () => ({ dbLoader: {} }));

const VENTURE_IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

/**
 * Minimal stub client covering the two tables these handlers touch: the
 * `from('ventures').select('id')` master-reset uses, and the operations_audit_log inserts
 * FR-3 added. Audit rows are captured so tests can assert on them rather than just on the
 * absence of an error.
 *
 * `auditFails` makes every audit insert return an error, which is how the fail-closed
 * behaviour is exercised without touching any real table.
 */
function stubClient({ auditFails = false } = {}) {
  const auditRows = [];
  return {
    auditRows,
    from(table) {
      if (table === 'operations_audit_log') {
        return {
          insert: async row => {
            if (auditFails) return { error: { message: 'audit sink unavailable' } };
            auditRows.push(row);
            return { error: null };
          },
        };
      }
      return { select: async () => ({ data: VENTURE_IDS.map(id => ({ id })), error: null }) };
    },
  };
}

async function makeApp(clientOpts) {
  const { default: venturesRoutes } = await import('../../server/routes/ventures.js');
  const app = express();
  // NOTE, coverage boundary: express.json() is deliberately NOT installed. Driving a
  // synthetic IncomingMessage through body-parser did not populate req.body, so the
  // request helper below assigns req.body directly instead. That means JSON PARSING
  // itself is out of scope here — this file tests the gate, not body-parser. The first
  // run of this suite had express.json() and the CONTROL tests failed with 428/400,
  // which is the only reason the missing body was noticed: the three refusal tests
  // passed happily with no body at all.
  app.locals.supabase = stubClient(clientOpts);
  // Both mounts, exactly as server/index.js:191-192 does it — one shared router object.
  app.use('/api/ventures', venturesRoutes);
  app.use('/api/competitor-analysis', venturesRoutes);
  return app;
}

/** Drive a request through the real express routing stack without binding a socket. */
function request(app, { method = 'POST', url, body = {} }) {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(null);
    req.method = method;
    req.url = url;
    req.headers = { 'content-type': 'application/json' };
    req.body = body; // see the coverage-boundary note in makeApp()

    const res = new ServerResponse(req);
    const chunks = [];
    const origEnd = res.end.bind(res);
    res.end = (chunk, ...rest) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = JSON.parse(raw); } catch { /* non-JSON body */ }
      resolve({ status: res.statusCode, body: json, raw });
      return origEnd(chunk, ...rest);
    };
    res.on('error', reject);
    app.handle(req, res, err => reject(err || new Error('unhandled')));
  });
}

const MOUNTS = ['/api/ventures', '/api/competitor-analysis'];
const ROUTES = [
  { name: 'master-reset', path: '/master-reset', body: {} },
  { name: 'bulk-full-delete', path: '/bulk-full-delete', body: { ids: VENTURE_IDS } },
  { name: 'full-delete', path: `/${VENTURE_IDS[0]}/full-delete`, body: {} },
];

beforeEach(() => {
  deleteVentureFullyMock.mockClear();
  process.env.DESTRUCTIVE_CONFIRM_SECRET = 'test-secret';
});

describe('FR-1: every destructive route refuses an unconfirmed request, on BOTH mounts', () => {
  for (const mount of MOUNTS) {
    for (const route of ROUTES) {
      it(`${mount}${route.path} refuses and never reaches the teardown`, async () => {
        const app = await makeApp();
        const res = await request(app, { url: `${mount}${route.path}`, body: route.body });

        expect(res.status).toBe(428);
        expect(res.body.code).toBe('CONFIRMATION_REQUIRED');
        expect(res.body.confirmation_token).toBeTruthy();
        // The load-bearing assertion: nothing was destroyed.
        expect(deleteVentureFullyMock).toHaveBeenCalledTimes(0);
      });
    }
  }
});

describe('FR-1 CONTROL: a fully confirmed request DOES proceed', () => {
  // Without this, "the teardown was never called" would also pass if the routes were
  // broken and unreachable — the refusal tests above would be vacuous.
  it('master-reset executes once confirmed, proving the refusals are real', async () => {
    const app = await makeApp();
    const preview = await request(app, { url: '/api/ventures/master-reset', body: {} });
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(0);

    const res = await request(app, {
      url: '/api/ventures/master-reset',
      body: {
        confirmation_token: preview.body.confirmation_token,
        acknowledgement: preview.body.acknowledgement_required,
        expected_count: preview.body.expected_count,
      },
    });

    expect(res.status).toBe(200);
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(VENTURE_IDS.length);
  });

  it('a token minted on ONE mount is accepted on the OTHER — same router, same target set', async () => {
    const app = await makeApp();
    const preview = await request(app, { url: '/api/ventures/master-reset', body: {} });

    const res = await request(app, {
      url: '/api/competitor-analysis/master-reset',
      body: {
        confirmation_token: preview.body.confirmation_token,
        acknowledgement: preview.body.acknowledgement_required,
        expected_count: preview.body.expected_count,
      },
    });

    expect(res.status).toBe(200);
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(VENTURE_IDS.length);
  });
});

describe('FR-4: fails CLOSED at the route when confirmation is unconfigured', () => {
  it('refuses with 503 and no teardown when no secret is present', async () => {
    delete process.env.DESTRUCTIVE_CONFIRM_SECRET;
    const priorInternal = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;
    try {
      const app = await makeApp();
      const res = await request(app, { url: '/api/ventures/master-reset', body: {} });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('CONFIRMATION_UNAVAILABLE');
      expect(deleteVentureFullyMock).toHaveBeenCalledTimes(0);
    } finally {
      if (priorInternal !== undefined) process.env.INTERNAL_API_KEY = priorInternal;
    }
  });
});

describe('FR-3: the teardown is bracketed by audit rows, and refuses when it cannot be audited', () => {
  async function confirmAndRun(app, url = '/api/ventures/master-reset') {
    const preview = await request(app, { url, body: {} });
    return request(app, {
      url,
      body: {
        confirmation_token: preview.body.confirmation_token,
        acknowledgement: preview.body.acknowledgement_required,
        expected_count: preview.body.expected_count,
      },
    });
  }

  it('writes a started row BEFORE and a completed row AFTER, using only live columns', async () => {
    const app = await makeApp();
    const res = await confirmAndRun(app);
    const rows = app.locals.supabase.auditRows;

    expect(res.status).toBe(200);
    expect(rows.map(r => r.action)).toEqual(['master-reset.started', 'master-reset.completed']);

    // Column contract: operations_audit_log has exactly these 9 columns. The insert in
    // lib/cleanup/archive.js:303-312 uses operation_type/details, which do not exist and
    // hard-error — this asserts we did not inherit that bug.
    const LIVE = ['entity_type', 'entity_id', 'action', 'performed_by', 'performed_at', 'module', 'severity', 'metadata'];
    for (const row of rows) {
      expect(Object.keys(row).every(k => LIVE.includes(k))).toBe(true);
      expect(row).not.toHaveProperty('operation_type');
      expect(row).not.toHaveProperty('details');
    }
    // The full target set survives even though entity_id cannot hold more than one id.
    expect(rows[0].metadata.target_ids).toEqual(VENTURE_IDS);
    expect(rows[1].metadata.succeeded).toBe(VENTURE_IDS.length);
  });

  it('FAILS CLOSED: an unwritable audit sink refuses the teardown entirely', async () => {
    const app = await makeApp({ auditFails: true });

    // The PRE-write throws, asyncHandler forwards it via next(err), and in production the
    // error middleware turns that into a 5xx. This harness mounts no error middleware, so
    // the rejection surfaces here instead — asserting a status code would be asserting a
    // property of the harness, not of the handler. What matters is below.
    await expect(confirmAndRun(app)).rejects.toThrow(/audit write failed/);

    // The load-bearing assertion: an irreversible teardown that cannot be recorded does
    // not run. Refusing costs a retry; proceeding unaudited costs the ability to ever know
    // what happened.
    expect(deleteVentureFullyMock).toHaveBeenCalledTimes(0);
  });

  it('writes a FAILED row when the teardown throws partway, so the trail is never started-never-finished', async () => {
    const app = await makeApp();
    deleteVentureFullyMock.mockImplementationOnce(async id => ({ success: true, venture: { id }, phases: {} }));
    deleteVentureFullyMock.mockImplementationOnce(async () => { throw new Error('teardown exploded at venture 2'); });

    await confirmAndRun(app).catch(() => {});
    const actions = app.locals.supabase.auditRows.map(r => r.action);

    expect(actions).toContain('master-reset.started');
    expect(actions).toContain('master-reset.failed');
    expect(actions).not.toContain('master-reset.completed');
    const failed = app.locals.supabase.auditRows.find(r => r.action === 'master-reset.failed');
    expect(failed.metadata.error).toMatch(/exploded/);
  });
});
