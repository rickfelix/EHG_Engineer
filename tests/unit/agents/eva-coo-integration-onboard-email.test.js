import { describe, it, expect, vi, beforeEach } from 'vitest';

const provisionVentureEmailMock = vi.fn();
vi.mock('../../../lib/venture-email/provision-venture-email.js', () => ({
  provisionVentureEmail: (...args) => provisionVentureEmailMock(...args),
}));

const instantiateVentureMock = vi.fn();
vi.mock('../../../lib/agents/venture-ceo-factory.js', () => ({
  VentureFactory: class {
    instantiateVenture(...args) {
      return instantiateVentureMock(...args);
    }
  },
}));

import { EVACOOIntegration } from '../../../lib/agents/eva-coo-integration.js';

function makeIntegration() {
  return new EVACOOIntegration({ supabaseClient: {}, evaAgentId: 'eva-1' });
}

describe('SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001 FR-2 onboardVenture email wiring', () => {
  beforeEach(() => {
    provisionVentureEmailMock.mockReset();
    instantiateVentureMock.mockReset();
    instantiateVentureMock.mockResolvedValue({ ceo_agent_id: 'ceo-1', total_agents_created: 3 });
  });

  it('skips email provisioning entirely when venture.domain is absent', async () => {
    const eva = makeIntegration();
    const result = await eva.onboardVenture({ id: 'v-1', name: 'NoDomainCo' }, true);

    expect(provisionVentureEmailMock).not.toHaveBeenCalled();
    expect(result.email_provisioning).toBeNull();
    expect(result.mode).toBe('delegated');
  });

  it('provisions email and surfaces state when venture.domain is present (delegated mode)', async () => {
    provisionVentureEmailMock.mockResolvedValue({ state: 'provisioned', revealedKey: null });
    const eva = makeIntegration();

    const result = await eva.onboardVenture({ id: 'v-2', name: 'DomainCo', domain: 'domainco.com' }, true);

    expect(provisionVentureEmailMock).toHaveBeenCalledWith(
      { id: 'v-2', domain: 'domainco.com' },
      { supabase: eva.supabase }
    );
    expect(result.email_provisioning).toEqual({ state: 'provisioned', revealedKey: null });
  });

  it('surfaces revealedKey on the result without throwing (non-recoverable secret)', async () => {
    const revealedKey = { secretRef: 'ref-1', keyId: 'key-1', keyValue: 'secret-value' };
    provisionVentureEmailMock.mockResolvedValue({ state: 'provisioned', revealedKey });
    const eva = makeIntegration();

    const result = await eva.onboardVenture({ id: 'v-3', name: 'KeyCo', domain: 'keyco.com' }, false);

    expect(result.email_provisioning.revealedKey).toEqual(revealedKey);
    expect(result.mode).toBe('direct');
  });

  it('fails soft: a provisioning error is captured on the result, never thrown, and never blocks onboarding', async () => {
    provisionVentureEmailMock.mockRejectedValue(new Error('registrar unreachable'));
    const eva = makeIntegration();

    const result = await eva.onboardVenture({ id: 'v-4', name: 'FlakyCo', domain: 'flakyco.com' }, true);

    expect(result.onboarded).toBe(true);
    expect(result.email_provisioning).toEqual({ state: 'failed', error: 'registrar unreachable' });
    expect(instantiateVentureMock).toHaveBeenCalled();
  });
});
