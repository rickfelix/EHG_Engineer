/**
 * Integration Tests: Auto-Chain Executor
 *
 * Tests the standalone SD auto-chaining system:
 * - QueueSelector: claim-aware SD ranking
 * - ClaimSwapper: atomic claim transfer
 * - AutoChainExecutor: composed chain flow
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 */

import { describe, test, expect } from 'vitest';
import { selectNextSD, getClaimedSdKeys } from '../../scripts/modules/handoff/queue-selector.js';
import { swapClaim, releaseClaim, refreshHeartbeat } from '../../scripts/modules/handoff/claim-swapper.js';
import { executeAutoChain, EXIT_CODES } from '../../scripts/modules/handoff/auto-chain-executor.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

describe('QueueSelector', () => {
  test('selectNextSD returns SD with highest priority', async () => {
    const result = await selectNextSD(supabase);
    expect(result).toHaveProperty('sd');
    expect(result).toHaveProperty('candidates');
    expect(result).toHaveProperty('reason');

    if (result.sd) {
      expect(result.sd).toHaveProperty('sd_key');
      expect(result.sd).toHaveProperty('title');
      expect(result.sd).toHaveProperty('priority');
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  test('selectNextSD excludes specified SD keys', async () => {
    const firstResult = await selectNextSD(supabase);
    if (!firstResult.sd) return;

    const secondResult = await selectNextSD(supabase, {
      excludeSdKeys: [firstResult.sd.sd_key]
    });

    if (secondResult.sd) {
      expect(secondResult.sd.sd_key).not.toBe(firstResult.sd.sd_key);
    }
  });

  test('selectNextSD excludes by UUID', async () => {
    const firstResult = await selectNextSD(supabase);
    if (!firstResult.sd) return;

    const secondResult = await selectNextSD(supabase, {
      excludeSdId: firstResult.sd.id
    });

    if (secondResult.sd) {
      expect(secondResult.sd.id).not.toBe(firstResult.sd.id);
    }
  });

  test('selectNextSD orchestratorsOnly filters to top-level', async () => {
    const result = await selectNextSD(supabase, { orchestratorsOnly: true });

    if (result.sd) {
      expect(result.sd.parent_sd_id).toBeNull();
    }
    for (const candidate of result.candidates) {
      expect(candidate.parent_sd_id).toBeNull();
    }
  });

  test('getClaimedSdKeys returns array', async () => {
    const claimed = await getClaimedSdKeys(supabase);
    expect(Array.isArray(claimed)).toBe(true);
  });
});

describe('ClaimSwapper', () => {
  test('swapClaim rejects missing params', async () => {
    const result = await swapClaim(supabase, {
      sessionId: null,
      oldSdKey: 'old',
      newSdKey: 'new'
    });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Missing');
  });

  test('swapClaim fails for non-existent session', async () => {
    const result = await swapClaim(supabase, {
      sessionId: 'non-existent-session-id',
      oldSdKey: null,
      newSdKey: 'SD-FAKE-001'
    });
    expect(result.success).toBe(false);
  });

  test('releaseClaim fails for non-existent session', async () => {
    const result = await releaseClaim(supabase, 'non-existent', 'SD-FAKE-001');
    expect(result.success).toBe(false);
  });

  test('refreshHeartbeat does not throw for non-existent session', async () => {
    await expect(
      refreshHeartbeat(supabase, 'non-existent')
    ).resolves.not.toThrow();
  });
});

describe('AutoChainExecutor', () => {
  test('returns EXIT_CHAINING_DISABLED when auto_proceed is false', async () => {
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: 'fake-session',
      chainEnabled: true,
      autoProceed: false
    });
    expect(result.exitCode).toBe(EXIT_CODES.EXIT_CHAINING_DISABLED);
    expect(result.chainContinue).toBe(false);
  });

  test('returns EXIT_CHAINING_DISABLED when chainEnabled is false', async () => {
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: 'fake-session',
      chainEnabled: false,
      autoProceed: true
    });
    expect(result.exitCode).toBe(EXIT_CODES.EXIT_CHAINING_DISABLED);
    expect(result.chainContinue).toBe(false);
  });

  test('returns EXIT_MAX_DEPTH when chain depth exceeded', async () => {
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: 'fake-session',
      chainEnabled: true,
      autoProceed: true,
      chainDepth: 10
    });
    expect(result.exitCode).toBe(EXIT_CODES.EXIT_MAX_DEPTH);
    expect(result.chainContinue).toBe(false);
  });

  test('returns EXIT_NO_SESSION when sessionId is null', async () => {
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: null,
      chainEnabled: true,
      autoProceed: true
    });
    expect(result.exitCode).toBe(EXIT_CODES.EXIT_NO_SESSION);
    expect(result.chainContinue).toBe(false);
  });

  test('result shape is correct', async () => {
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: 'fake-session',
      chainEnabled: true,
      autoProceed: true
    });
    expect(result).toHaveProperty('exitCode');
    expect(result).toHaveProperty('chainContinue');
    expect(result).toHaveProperty('nextSD');
    expect(result).toHaveProperty('nextSdKey');
    expect(result).toHaveProperty('nextSdId');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('chainDepth');
    expect(result).toHaveProperty('chainHistory');
  });

  test('chain history prevents infinite loops', async () => {
    const allSDs = await selectNextSD(supabase);
    if (!allSDs.candidates.length) return;

    const allKeys = allSDs.candidates.map(sd => sd.sd_key);
    const result = await executeAutoChain(supabase, {
      completedSdId: 'fake-uuid',
      completedSdKey: 'SD-FAKE-001',
      sessionId: 'fake-session',
      chainEnabled: true,
      autoProceed: true,
      chainHistory: allKeys
    });
    expect(result.chainContinue).toBe(false);
  });
});

describe('EXIT_CODES', () => {
  test('all exit codes are defined', () => {
    expect(EXIT_CODES.CHAIN_SUCCESS).toBe('CHAIN_SUCCESS');
    expect(EXIT_CODES.EXIT_EMPTY_QUEUE).toBe('EXIT_EMPTY_QUEUE');
    expect(EXIT_CODES.EXIT_ALL_CLAIMED).toBe('EXIT_ALL_CLAIMED');
    expect(EXIT_CODES.EXIT_MAX_DEPTH).toBe('EXIT_MAX_DEPTH');
    expect(EXIT_CODES.EXIT_CHAINING_DISABLED).toBe('EXIT_CHAINING_DISABLED');
    expect(EXIT_CODES.EXIT_DB_ERROR).toBe('EXIT_DB_ERROR');
    expect(EXIT_CODES.EXIT_NO_SESSION).toBe('EXIT_NO_SESSION');
  });
});
