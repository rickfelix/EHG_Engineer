/**
 * Rubric Evaluator Tests
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A
 *
 * Tests the schema validation, prompt building, and response parsing
 * logic of the AI-powered rubric evaluator.
 */


// We test the validation function directly since the module is ESM
// Import the module to test schema validation
const mod = await import(
  '../../../../lib/sub-agents/vetting/rubric-evaluator.js'
);
const validateEvaluationSchema = mod.validateEvaluationSchema || mod.default?.validateEvaluationSchema;

const EXPECTED_CRITERIA = ['value', 'risk', 'complexity', 'reversibility', 'alignment', 'testability'];

function makeValidEvaluation() {
  return {
    criteria: EXPECTED_CRITERIA.map(id => ({
      id,
      name: `${id} criterion`,
      score: 75,
      summary: 'This is a detailed summary that meets the minimum length requirement.',
      reasoning: ['First detailed reasoning point', 'Second detailed reasoning point'],
      evidence: ['Quote from the proposal text'],
      improvements: ['Suggestion for improvement']
    })),
    overall_score: 72
  };
}

describe('validateEvaluationSchema', () => {
  test('accepts valid evaluation with all criteria', () => {
    const result = validateEvaluationSchema(makeValidEvaluation(), EXPECTED_CRITERIA);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects null input', () => {
    const result = validateEvaluationSchema(null, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Response is not an object');
  });

  test('rejects missing criteria array', () => {
    const result = validateEvaluationSchema({ overall_score: 50 }, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or non-array "criteria" field');
  });

  test('rejects wrong number of criteria', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria = eval_.criteria.slice(0, 3);
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Expected 6 criteria'))).toBe(true);
  });

  test('rejects score out of range', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[0].score = 150;
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('score must be 0-100'))).toBe(true);
  });

  test('rejects overall_score out of range', () => {
    const eval_ = makeValidEvaluation();
    eval_.overall_score = -10;
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('overall_score must be 0-100'))).toBe(true);
  });

  test('rejects summary too short', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[0].summary = 'Short';
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('summary too short'))).toBe(true);
  });

  test('rejects insufficient reasoning bullets', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[0].reasoning = ['Only one point'];
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('reasoning needs >=2'))).toBe(true);
  });

  test('rejects missing improvements', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[0].improvements = [];
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('needs >=1 improvement'))).toBe(true);
  });

  test('rejects missing expected criterion', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[0].id = 'unknown_criterion';
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing expected criterion: value'))).toBe(true);
  });

  test('rejects duplicate criterion IDs', () => {
    const eval_ = makeValidEvaluation();
    eval_.criteria[1].id = eval_.criteria[0].id;
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate criterion id'))).toBe(true);
  });

  test('rejects missing required fields in criterion', () => {
    const eval_ = makeValidEvaluation();
    delete eval_.criteria[0].score;
    const result = validateEvaluationSchema(eval_, EXPECTED_CRITERIA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing field: score'))).toBe(true);
  });
});
