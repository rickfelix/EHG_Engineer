/**
 * SD-LEO-INFRA-STAGE0-THESIS-CONTRACT-001 — Stage-0 thesis + explicit-decisions contract.
 * Spec R3 (thesis-not-score, pre-registered kills as consumable contracts) + R5 (named
 * decisions replace silent assumptions; form factor first). Bravo ledger findings 4/6.
 */
import { describe, it, expect } from 'vitest';
import {
  validateVentureThesis,
  validateKillCriteria,
  evaluateKillCriterion,
  buildThesisFromSynthesis,
  deriveDefaultKillCriteria,
  EXPLICIT_DECISIONS,
  buildExplicitDecisions,
  validateExplicitDecisions,
  PRICE_MODELS,
} from '../../../../lib/eva/stage-zero/thesis-contract.js';
import { validateVentureBrief } from '../../../../lib/eva/stage-zero/interfaces.js';
import { scanTextForStackCompliance, ruleApplies } from '../../../../lib/eva/standards/venture-stack-compliance.js';
import { FORBIDDEN } from '../../../../lib/eva/standards/venture-stack-policy.js';

const FULL_THESIS = {
  who_pays: 'B2B SaaS founders with 5-50 employees',
  pays_for_what: 'automated churn-risk digests from their existing billing data',
  reached_how: 'founder communities; SEO on churn keywords',
  price_point: { amount_low: 49, amount_high: 49, currency: 'USD', model: 'recurring', raw_text: 'subscription $49/mo' },
  demand_test_plan: [
    { step: 1, instruction: 'Landing page with request-access CTA', success_signal: '>=10 qualified signups' },
    { step: 2, instruction: 'Pre-order ask at $49/mo', success_signal: '>=3 pre-commitments' },
  ],
};

const VALID_KILLS = [
  { id: 'k1', metric: 'signups', comparator: 'lt', threshold: 10, stage_by: 12, description: 'dies if <10 signups by S12', source: 'derived_default' },
];

function fullBrief(overrides = {}) {
  return {
    name: 'ChurnLens',
    problem_statement: 'Founders discover churn too late',
    solution: 'Automated churn-risk digests',
    target_market: 'B2B SaaS founders',
    origin_type: 'discovery',
    raw_chairman_intent: 'catch churn early',
    maturity: 'ready',
    thesis: FULL_THESIS,
    kill_criteria: VALID_KILLS,
    explicit_decisions: buildExplicitDecisions(),
    ...overrides,
  };
}

describe('FR-1: thesis validation', () => {
  it('accepts a complete thesis', () => {
    expect(validateVentureThesis(FULL_THESIS).valid).toBe(true);
  });

  it('rejects a missing/empty thesis and names every missing field', () => {
    const r = validateVentureThesis(null);
    expect(r.valid).toBe(false);
    const r2 = validateVentureThesis({});
    expect(r2.valid).toBe(false);
    for (const f of ['who_pays', 'pays_for_what', 'reached_how', 'price_point']) {
      expect(r2.errors.join(' ')).toContain(f);
    }
  });

  it('requires a demand-test plan of >=2 concrete steps with success signals', () => {
    const r = validateVentureThesis({ ...FULL_THESIS, demand_test_plan: [{ instruction: 'x' }] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('demand_test_plan');
  });
});

describe('FR-1: validateVentureBrief enforcement (thesis-less score REJECTED)', () => {
  it('rejects a score-only brief with no thesis/kills/decisions', () => {
    const r = validateVentureBrief({ ...fullBrief(), thesis: undefined, kill_criteria: undefined, explicit_decisions: undefined, composite_score: 87 });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/thesis contract/);
    expect(r.errors.join(' ')).toMatch(/kill contract/);
    expect(r.errors.join(' ')).toMatch(/decision contract/);
  });

  it('accepts a complete contract-carrying brief', () => {
    const r = validateVentureBrief(fullBrief());
    expect(r.valid).toBe(true);
  });

  it('a SCORELESS brief with a full thesis validates (thesis independent of score)', () => {
    const brief = fullBrief();
    delete brief.composite_score;
    expect(validateVentureBrief(brief).valid).toBe(true);
  });

  it("a CORE-incomplete thesis (who_pays) is representable but cannot carry maturity 'ready'", () => {
    const coreIncomplete = { ...FULL_THESIS, who_pays: undefined, incomplete_fields: ['who_pays'] };
    const rejected = validateVentureBrief(fullBrief({ thesis: coreIncomplete, maturity: 'ready' }));
    expect(rejected.valid).toBe(false);
    expect(rejected.errors.join(' ')).toContain("demote to 'seed'");
    const accepted = validateVentureBrief(fullBrief({ thesis: coreIncomplete, maturity: 'seed' }));
    expect(accepted.valid).toBe(true);
  });

  it("a SOFT-incomplete thesis (price_point) stays 'ready'-eligible — the demand test refines it (PR #5809 round-1)", () => {
    const softIncomplete = { ...FULL_THESIS, price_point: undefined, incomplete_fields: ['price_point'] };
    const r = validateVentureBrief(fullBrief({ thesis: softIncomplete, maturity: 'ready' }));
    expect(r.valid).toBe(true);
  });
});

describe('FR-1: buildThesisFromSynthesis derivation with provenance', () => {
  const pathOutput = {
    target_market: 'indie game studios',
    suggested_solution: 'asset-pipeline automation',
    metadata: { path: 'trend_scanner' },
  };
  const candidate = { revenue_model: 'subscription', monthly_revenue_potential: '$5K/month', automation_approach: 'discord communities' };

  it('every derived field carries provenance naming its source; nothing invented', () => {
    const t = buildThesisFromSynthesis(pathOutput, {}, candidate);
    expect(t.who_pays).toBe('indie game studios');
    expect(t.provenance.who_pays.source_field).toBe('target_market');
    // payer-uncertainty honestly flagged: target_market != payer for ad/marketplace models
    expect(t.provenance.who_pays.weak).toBe(true);
    expect(t.provenance.who_pays.assumption).toBe('payer_assumed_equal_to_target_market');
    expect(t.provenance.pays_for_what.source_field).toBe('suggested_solution');
    expect(t.provenance.price_point.source_field).toContain('revenue_model');
    expect(t.price_point.raw_text).toContain('E0 ungraded'); // LLM estimate honestly labeled
    expect(t.price_point.amount_low).toBe(5000);
    expect(t.price_point.amount_high).toBe(5000);
    expect(t.price_point.currency).toBe('USD');
    expect(t.price_point.model).toBe('recurring'); // 'subscription' revenue_model
    expect(t.price_point.grade).toBe('E0');
    expect(t.incomplete_fields).toEqual([]);
    expect(t.demand_test_plan.length).toBeGreaterThanOrEqual(2);
    expect(validateVentureThesis(t).valid).toBe(true);
  });

  it('prefers synthesis virality channels for reached_how when present', () => {
    const t = buildThesisFromSynthesis(pathOutput, { virality: { viral_channels: ['discord', 'itch.io devlogs'] } }, candidate);
    expect(t.reached_how).toContain('discord');
    expect(t.provenance.reached_how.source_field).toBe('synthesis.virality.viral_channels');
  });

  it('missing sources are DECLARED in incomplete_fields, never silently blanked', () => {
    const t = buildThesisFromSynthesis({}, {}, {});
    expect(t.incomplete_fields).toContain('who_pays');
    expect(t.incomplete_fields).toContain('price_point');
    expect(t.incomplete_fields).toContain('demand_test_plan');
    expect(t.price_point).toBeUndefined(); // absent, not a half-built structure
    expect(validateVentureThesis(t).valid).toBe(false); // incomplete thesis does not masquerade as valid
  });
});

describe('FR-1b: price_point is a structured field (SD-LEO-INFRA-STAGE0-THESIS-PRICING-KEY-001)', () => {
  it('validateVentureThesis rejects a string price_point (the old prose shape)', () => {
    const r = validateVentureThesis({ ...FULL_THESIS, price_point: 'subscription $49/mo' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('thesis.price_point is required (structured object');
  });

  it('validateVentureThesis rejects a structured price_point missing required sub-fields', () => {
    const r = validateVentureThesis({ ...FULL_THESIS, price_point: { amount_low: 10 } });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('thesis.price_point.currency is required');
    expect(r.errors.join(' ')).toContain('thesis.price_point.model must be one of');
    expect(r.errors.join(' ')).toContain('thesis.price_point.raw_text is required');
  });

  it('validateVentureThesis rejects a non-numeric amount and an unlisted model', () => {
    const r1 = validateVentureThesis({ ...FULL_THESIS, price_point: { ...FULL_THESIS.price_point, amount_low: '49' } });
    expect(r1.errors.join(' ')).toContain('thesis.price_point.amount_low must be a number or null');
    const r2 = validateVentureThesis({ ...FULL_THESIS, price_point: { ...FULL_THESIS.price_point, model: 'freemium' } });
    expect(r2.errors.join(' ')).toContain(`thesis.price_point.model must be one of ${PRICE_MODELS.join('|')}`);
  });

  it('accepts null amounts (price genuinely unknown yet, refined by the demand test)', () => {
    const r = validateVentureThesis({
      ...FULL_THESIS,
      price_point: { amount_low: null, amount_high: null, currency: 'USD', model: 'unknown', raw_text: 'price TBD via WTP probe' },
    });
    expect(r.valid).toBe(true);
  });

  it('buildThesisFromSynthesis infers model=recurring/one_time/unknown from revenue_model text', () => {
    const pathOutput = { target_market: 'x', suggested_solution: 'y' };
    const recurring = buildThesisFromSynthesis(pathOutput, {}, { revenue_model: 'monthly subscription', monthly_revenue_potential: '$10/month' });
    expect(recurring.price_point.model).toBe('recurring');

    const oneTime = buildThesisFromSynthesis(pathOutput, {}, { revenue_model: 'one-time license fee', monthly_revenue_potential: null });
    expect(oneTime.price_point.model).toBe('one_time');
    expect(oneTime.price_point.amount_low).toBeNull();
    expect(oneTime.price_point.amount_high).toBeNull();
    expect(oneTime.price_point.currency).toBe('USD');

    const unknownModel = buildThesisFromSynthesis(pathOutput, {}, { revenue_model: 'ads', monthly_revenue_potential: null });
    expect(unknownModel.price_point.model).toBe('unknown');
  });

  it('a parsed monthly_revenue_potential with NO revenue_model text still produces a valid structured price_point (model=unknown)', () => {
    const pathOutput = { target_market: 'x', suggested_solution: 'y' };
    const t = buildThesisFromSynthesis(pathOutput, {}, { monthly_revenue_potential: '$2K-$5K/month', automation_approach: 'cold outreach' });
    expect(t.price_point.amount_low).toBe(2000);
    expect(t.price_point.amount_high).toBe(5000);
    expect(t.price_point.model).toBe('unknown');
    expect(t.price_point.grade).toBe('E0');
    expect(validateVentureThesis(t).valid).toBe(true);
  });

  it("deriveDefaultKillCriteria's kill-first-revenue description reads price_point.raw_text, not the object itself", () => {
    const kills = deriveDefaultKillCriteria(FULL_THESIS);
    const killFirstRevenue = kills.find((k) => k.id === 'kill-first-revenue');
    expect(killFirstRevenue.description).toContain('subscription $49/mo');
    expect(killFirstRevenue.description).not.toContain('[object Object]');

    const noPriceKills = deriveDefaultKillCriteria({});
    expect(noPriceKills.find((k) => k.id === 'kill-first-revenue').description).toContain('price point pending');
  });

  it('ALL-PATHS: the single production writer (buildThesisFromSynthesis) always emits a schema-valid structured price_point when any revenue signal exists', () => {
    const pathOutput = { target_market: 'x', suggested_solution: 'y' };
    const cases = [
      { revenue_model: 'subscription', monthly_revenue_potential: '$5K/month' },
      { revenue_model: 'one-time purchase', monthly_revenue_potential: null },
      { monthly_revenue_potential: '$500/month' },
    ];
    for (const candidate of cases) {
      const t = buildThesisFromSynthesis(pathOutput, {}, candidate);
      expect(typeof t.price_point).toBe('object');
      expect(PRICE_MODELS).toContain(t.price_point.model);
      expect(typeof t.price_point.raw_text).toBe('string');
      expect(t.price_point.raw_text.length).toBeGreaterThan(0);
    }
  });
});

describe('FR-2: kill criteria — machine-consumable contracts', () => {
  it('round-trip: derived defaults validate and evaluate with pure comparator math', () => {
    const kills = deriveDefaultKillCriteria(FULL_THESIS);
    expect(kills.length).toBeGreaterThanOrEqual(2);
    expect(validateKillCriteria(kills).valid).toBe(true);
    const demand = kills.find((k) => k.id === 'kill-demand-signals');
    expect(evaluateKillCriterion(demand, 7)).toMatchObject({ killed: true, observed: 7, threshold: 10 });
    expect(evaluateKillCriterion(demand, 12)).toMatchObject({ killed: false });
    for (const k of kills) expect(k.source).toBe('derived_default');
  });

  it('rejects malformed criteria: bad comparator, non-numeric threshold, stage_by out of range', () => {
    expect(validateKillCriteria([{ ...VALID_KILLS[0], comparator: 'below' }]).valid).toBe(false);
    expect(validateKillCriteria([{ ...VALID_KILLS[0], threshold: 'ten' }]).valid).toBe(false);
    expect(validateKillCriteria([{ ...VALID_KILLS[0], stage_by: 0 }]).valid).toBe(false);
    expect(validateKillCriteria([{ ...VALID_KILLS[0], stage_by: 27 }]).valid).toBe(false);
    expect(validateKillCriteria([]).valid).toBe(false);
  });

  it('an unobservable metric fails CLOSED with the unobservable flag (HOLD, never auto-kill)', () => {
    const r = evaluateKillCriterion(VALID_KILLS[0], undefined);
    expect(r.killed).toBe(true);
    expect(r.unobservable).toBe(true); // consuming gates must HOLD, not treat as a fired falsifier
    expect(r.reason).toBe('unobservable_metric_fail_closed');
    // a genuinely observed value never carries the flag
    expect(evaluateKillCriterion(VALID_KILLS[0], 7).unobservable).toBeUndefined();
  });

  it('all five comparators evaluate correctly', () => {
    const base = { ...VALID_KILLS[0], threshold: 5 };
    expect(evaluateKillCriterion({ ...base, comparator: 'lt' }, 4).killed).toBe(true);
    expect(evaluateKillCriterion({ ...base, comparator: 'lte' }, 5).killed).toBe(true);
    expect(evaluateKillCriterion({ ...base, comparator: 'gt' }, 6).killed).toBe(true);
    expect(evaluateKillCriterion({ ...base, comparator: 'gte' }, 5).killed).toBe(true);
    expect(evaluateKillCriterion({ ...base, comparator: 'eq' }, 5).killed).toBe(true);
    expect(evaluateKillCriterion({ ...base, comparator: 'lt' }, 5).killed).toBe(false);
  });
});

describe('FR-3: explicit-decision registry (form factor first)', () => {
  it('registry pins form_factor: web default, native anti-goal, named native criterion', () => {
    expect(Object.keys(EXPLICIT_DECISIONS)).toEqual(['form_factor']);
    expect(EXPLICIT_DECISIONS.form_factor.default).toBe('web');
    expect(EXPLICIT_DECISIONS.form_factor.allowed).toEqual(['web', 'pwa', 'native']);
    expect(EXPLICIT_DECISIONS.form_factor.phase1_anti_goal).toBe('native');
    expect(EXPLICIT_DECISIONS.form_factor.native_criterion).toContain('LOAD-BEARING');
  });

  it('default build records value, default, decided_by, rationale, and the native criterion', () => {
    const d = buildExplicitDecisions();
    expect(d.form_factor).toMatchObject({ value: 'web', default: 'web', decided_by: 'default' });
    expect(d.form_factor.rationale).toContain('anti-goal');
    expect(d.form_factor.criterion_for_native).toContain('PWA');
    expect(validateExplicitDecisions(d).valid).toBe(true);
  });

  it('a chairman override with an allowed value is recorded as decided_by chairman', () => {
    const d = buildExplicitDecisions({ form_factor: { value: 'pwa', rationale: 'offline field use, no native need' } });
    expect(d.form_factor).toMatchObject({ value: 'pwa', decided_by: 'chairman' });
  });

  it('an invalid override falls back to the declared default (never an unallowed value)', () => {
    const d = buildExplicitDecisions({ form_factor: { value: 'vr-headset' } });
    expect(d.form_factor.value).toBe('web');
    expect(d.form_factor.decided_by).toBe('default');
  });

  it('validateExplicitDecisions rejects missing keys and unallowed values', () => {
    expect(validateExplicitDecisions(null).valid).toBe(false);
    expect(validateExplicitDecisions({}).valid).toBe(false);
    expect(validateExplicitDecisions({ form_factor: { value: 'desktop', rationale: 'x' } }).valid).toBe(false);
  });
});

describe('FR-4: venture-stack-policy consumes the form-factor decision', () => {
  const CLI_TEXT = 'The product is a CLI tool users install via npm.';

  it('back-compat: no decisions passed -> cli_as_product still fires (declared default governs)', () => {
    const r = scanTextForStackCompliance([CLI_TEXT]);
    expect(r.compliant).toBe(false);
    expect(r.violations.map((v) => v.id)).toContain('cli_as_product');
    expect(r.skippedRules).toEqual([]);
  });

  it('an explicit non-web decision skips the rule and SAYS so', () => {
    const decisions = { form_factor: { value: 'native', decided_by: 'chairman' } };
    const r = scanTextForStackCompliance([CLI_TEXT], { decisions });
    expect(r.violations.map((v) => v.id)).not.toContain('cli_as_product');
    expect(r.skippedRules.map((s) => s.id)).toContain('cli_as_product');
    expect(r.skippedRules[0].reason).toContain('explicit decision');
  });

  it('an explicit web/pwa decision keeps the rule active', () => {
    const r = scanTextForStackCompliance([CLI_TEXT], { decisions: { form_factor: { value: 'pwa' } } });
    expect(r.violations.map((v) => v.id)).toContain('cli_as_product');
  });

  it('rules without appliesWhen are unaffected by decisions', () => {
    const supabaseRule = FORBIDDEN.find((f) => f.id === 'supabase_pkg');
    expect(ruleApplies(supabaseRule, { form_factor: { value: 'native' } })).toBe(true);
    const r = scanTextForStackCompliance(['uses @supabase/supabase-js for data'], { decisions: { form_factor: { value: 'native' } } });
    expect(r.violations.map((v) => v.id)).toContain('supabase_pkg');
  });

  it('LIVE consumer wired: checkVentureStackCompliance reads ventures.metadata.explicit_decisions and passes it through', async () => {
    const { checkVentureStackCompliance } = await import('../../../../lib/eva/bridge/venture-build-consumer.js');
    function mockSb({ decisions }) {
      return { from: (table) => {
        const c = {
          select: () => c,
          eq: () => c,
          maybeSingle: async () => ({ data: { metadata: { explicit_decisions: decisions } }, error: null }),
          then: (res) => Promise.resolve(
            table === 'venture_artifacts'
              ? { data: [{ artifact_type: 'spec', content: CLI_TEXT, artifact_data: null }], error: null }
              : { data: null, error: null }
          ).then(res),
        };
        return c;
      } };
    }
    // recorded native decision -> cli_as_product skipped in the LIVE consumer path
    const skipped = await checkVentureStackCompliance(mockSb({ decisions: { form_factor: { value: 'native' } } }), 'v-1');
    expect(skipped.violations.map((v) => v.id)).not.toContain('cli_as_product');
    expect(skipped.skippedRules.map((s) => s.id)).toContain('cli_as_product');
    // no recorded decision -> defaults govern, rule fires
    const fires = await checkVentureStackCompliance(mockSb({ decisions: undefined }), 'v-2');
    expect(fires.violations.map((v) => v.id)).toContain('cli_as_product');
  });
});
