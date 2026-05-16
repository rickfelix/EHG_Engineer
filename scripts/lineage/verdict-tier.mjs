import { CONFIDENCE_THRESHOLD, VERDICT_HIGH, VERDICT_LOW } from './constants.mjs';

export function mapConfidenceToVerdict(confidence) {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    throw new TypeError('confidence must be a number');
  }
  if (confidence < 0 || confidence > 100) {
    throw new RangeError('confidence must be in [0, 100]');
  }
  return confidence >= CONFIDENCE_THRESHOLD ? VERDICT_HIGH : VERDICT_LOW;
}
