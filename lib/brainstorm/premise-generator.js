/**
 * Premise Generator
 * SD: SD-LEO-INFRA-BOARD-DELIBERATION-STRUCTURAL-001A
 *
 * Maps topic domain keywords to 6 distinct premise constraints,
 * each forcing a different cognitive frame for board deliberation.
 */

const PREMISE_TYPES = [
  {
    type: 'security_threat',
    constraint: 'Assume adversaries will exploit this. What attack surface does it create?',
    frame: 'security'
  },
  {
    type: 'resource_scarcity',
    constraint: 'Assume we have half our current engineering capacity. What gets cut?',
    frame: 'resource'
  },
  {
    type: 'urgency',
    constraint: 'Assume this must ship in 48 hours. What is the irreducible core?',
    frame: 'urgency'
  },
  {
    type: 'naive_questioner',
    constraint: 'Assume the user has never seen this system. What is confusing or opaque?',
    frame: 'naive'
  },
  {
    type: 'competitive_pressure',
    constraint: 'Assume a competitor launched this yesterday. What differentiates our approach?',
    frame: 'competitive'
  },
  {
    type: 'scale',
    constraint: 'Assume this becomes the most-used feature in the system. What breaks at 100x load?',
    frame: 'scale'
  }
];

/**
 * Generate premise assignments for a panel of board seats.
 * Deterministic: same topic keywords produce the same assignment order.
 *
 * @param {string} topic - The brainstorm topic
 * @param {string[]} keywords - Topic keywords
 * @param {number} seatCount - Number of seats to assign (default: 6)
 * @returns {Array<{type: string, constraint: string, frame: string}>}
 */
export function generatePremises(topic, keywords = [], seatCount = 6) {
  const hash = simpleHash(topic + keywords.join(','));
  const shuffled = [...PREMISE_TYPES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, seatCount);
}

/**
 * Simple deterministic hash for premise ordering.
 * @param {string} str
 * @returns {number}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export { PREMISE_TYPES };
