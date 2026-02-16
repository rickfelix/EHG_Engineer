/**
 * Security and API Authentication Tests
 *
 * Tests for:
 * - API auth middleware (createAuthMiddleware, requireChairman, isChairman)
 * - RLS audit script
 * - Security audit dashboard
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-J
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('Security and API Authentication', () => {
  describe('API Auth Middleware', () => {
    const authPath = resolve(ROOT, 'lib/middleware/api-auth.js');

    it('exists', () => {
      expect(existsSync(authPath)).toBe(true);
    });

    it('exports createAuthMiddleware', async () => {
      const mod = await import(authPath);
      expect(typeof mod.createAuthMiddleware).toBe('function');
    });

    it('exports requireChairman', async () => {
      const mod = await import(authPath);
      expect(typeof mod.requireChairman).toBe('function');
    });

    it('exports isChairman', async () => {
      const mod = await import(authPath);
      expect(typeof mod.isChairman).toBe('function');
    });

    it('createAuthMiddleware returns a function', async () => {
      const { createAuthMiddleware } = await import(authPath);
      const middleware = createAuthMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('supports public routes configuration', () => {
      const src = readFileSync(authPath, 'utf-8');
      expect(src).toContain('PUBLIC_ROUTES');
      expect(src).toContain('/api/health');
      expect(src).toContain('/api/status');
    });

    it('validates Bearer token format', () => {
      const src = readFileSync(authPath, 'utf-8');
      expect(src).toContain("startsWith('Bearer ')");
      expect(src).toContain('AUTH_MISSING');
    });

    it('supports service role API key', () => {
      const src = readFileSync(authPath, 'utf-8');
      expect(src).toContain('x-api-key');
      expect(src).toContain('service_role');
    });

    it('requireChairman returns 403 for non-chairman users', async () => {
      const { requireChairman } = await import(authPath);
      const req = { user: { isChairman: false, isServiceRole: false } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      requireChairman(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        code: 'FORBIDDEN_NOT_CHAIRMAN',
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('requireChairman allows chairman users', async () => {
      const { requireChairman } = await import(authPath);
      const req = { user: { isChairman: true, isServiceRole: false } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireChairman(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('requireChairman allows service role', async () => {
      const { requireChairman } = await import(authPath);
      const req = { user: { isChairman: false, isServiceRole: true } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireChairman(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('requireChairman returns 401 without user', async () => {
      const { requireChairman } = await import(authPath);
      const req = {};
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireChairman(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('RLS Audit Script', () => {
    const rlsPath = resolve(ROOT, 'scripts/audit-rls-policies.js');

    it('exists', () => {
      expect(existsSync(rlsPath)).toBe(true);
    });

    it('queries pg_policies for RLS information', () => {
      const src = readFileSync(rlsPath, 'utf-8');
      expect(src).toContain('pg_policies');
      expect(src).toContain('relrowsecurity');
    });

    it('supports --json output', () => {
      const src = readFileSync(rlsPath, 'utf-8');
      expect(src).toContain('--json');
      expect(src).toContain('JSON_MODE');
    });

    it('tracks exempted tables', () => {
      const src = readFileSync(rlsPath, 'utf-8');
      expect(src).toContain('EXEMPTED_TABLES');
    });
  });

  describe('Security Audit Dashboard', () => {
    const dashPath = resolve(ROOT, 'scripts/security-audit-dashboard.js');

    it('exists', () => {
      expect(existsSync(dashPath)).toBe(true);
    });

    it('checks RLS coverage', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('checkRlsCoverage');
    });

    it('checks fn_is_chairman function', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('checkFnIsChairman');
      expect(src).toContain('fn_is_chairman');
    });

    it('checks secret management', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('checkSecretManagement');
      expect(src).toContain('.gitignore');
      expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('checks API route protection', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('checkApiRouteProtection');
    });

    it('calculates overall security score', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('overallScore');
    });

    it('supports --json output', () => {
      const src = readFileSync(dashPath, 'utf-8');
      expect(src).toContain('--json');
    });
  });
});
