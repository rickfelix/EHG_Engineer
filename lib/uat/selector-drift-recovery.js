/**
 * Selector Drift Recovery Module
 *
 * Detects when previously captured selectors no longer match DOM elements
 * and attempts to recover by finding similar elements using heuristics.
 */

/**
 * Attempt to recover from selector drift
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {Object} domCapture - Original DOM capture metadata
 * @returns {Promise<Object>} Recovery result with new selector or null
 */
export async function recoverFromDrift(page, domCapture) {
  const {
    primary_selector,
    alternative_selectors = [],
    tag_name,
    text_content,
    attributes = {},
    bounding_box
  } = domCapture;

  const strategies = [];

  // Strategy 1: Try all alternative selectors
  for (const selector of alternative_selectors) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        strategies.push({
          strategy: 'alternative_selector',
          selector,
          confidence: 0.8,
          message: `Alternative selector matched: ${selector}`
        });
      }
    } catch {
      // Invalid selector, skip
    }
  }

  // Strategy 2: Search by data-testid pattern
  if (attributes['data-testid']) {
    const testId = attributes['data-testid'];
    // Try partial match
    const partialSelector = `[data-testid*="${testId.split('-')[0]}"]`;
    try {
      const elements = await page.locator(partialSelector).all();
      for (const el of elements) {
        const currentTestId = await el.getAttribute('data-testid');
        if (currentTestId && currentTestId.includes(testId.split('-')[0])) {
          strategies.push({
            strategy: 'testid_pattern',
            selector: `[data-testid="${currentTestId}"]`,
            confidence: 0.7,
            message: `Similar testid found: ${currentTestId}`
          });
        }
      }
    } catch {
      // Pattern search failed
    }
  }

  // Strategy 3: Search by text content
  if (text_content && text_content.length > 2) {
    const searchText = text_content.substring(0, 30);
    try {
      const textSelector = `${tag_name || '*'}:has-text("${escapeText(searchText)}")`;
      const count = await page.locator(textSelector).count();
      if (count > 0 && count < 5) {
        strategies.push({
          strategy: 'text_content',
          selector: textSelector,
          confidence: 0.6,
          message: `Text match found: "${searchText}..."`
        });
      }
    } catch {
      // Text search failed
    }
  }

  // Strategy 4: Search by role and accessible name
  if (attributes.role || attributes['aria-label']) {
    const role = attributes.role || tag_name;
    const name = attributes['aria-label'] || text_content?.substring(0, 20);
    if (role && name) {
      try {
        const roleSelector = `[role="${role}"]`;
        const elements = await page.locator(roleSelector).all();
        for (const el of elements.slice(0, 10)) {
          const elName = await el.getAttribute('aria-label') || await el.textContent();
          if (elName && elName.includes(name.split(' ')[0])) {
            strategies.push({
              strategy: 'role_name',
              selector: roleSelector,
              confidence: 0.5,
              message: `Role/name match: ${role} with "${name}"`
            });
            break;
          }
        }
      } catch {
        // Role search failed
      }
    }
  }

  // Strategy 5: Search by class pattern
  if (attributes.class) {
    const classes = attributes.class.split(' ').filter(c =>
      c && !c.match(/^(hover|active|focus|disabled|hidden|visible|--|__)/)
    );
    for (const cls of classes.slice(0, 2)) {
      try {
        const classSelector = `.${cls}`;
        const count = await page.locator(classSelector).count();
        if (count > 0 && count < 10) {
          strategies.push({
            strategy: 'class_pattern',
            selector: `${tag_name || '*'}${classSelector}`,
            confidence: 0.4,
            message: `Class pattern matched: .${cls}`
          });
        }
      } catch {
        // Class search failed
      }
    }
  }

  // Strategy 6: Search by position (last resort)
  if (bounding_box) {
    try {
      const nearbyElement = await findElementNearPosition(page, bounding_box, tag_name);
      if (nearbyElement) {
        strategies.push({
          strategy: 'position',
          selector: nearbyElement.selector,
          confidence: 0.3,
          message: `Position-based match at (${bounding_box.x}, ${bounding_box.y})`
        });
      }
    } catch {
      // Position search failed
    }
  }

  // Sort by confidence and return best match
  strategies.sort((a, b) => b.confidence - a.confidence);

  if (strategies.length > 0) {
    return {
      recovered: true,
      original_selector: primary_selector,
      new_selector: strategies[0].selector,
      confidence: strategies[0].confidence,
      strategy: strategies[0].strategy,
      message: strategies[0].message,
      alternatives_tried: strategies.length
    };
  }

  return {
    recovered: false,
    original_selector: primary_selector,
    new_selector: null,
    confidence: 0,
    strategy: 'none',
    message: 'No matching element found. Manual intervention required.',
    alternatives_tried: 0
  };
}

/**
 * Find element near a given position
 */
async function findElementNearPosition(page, bbox, preferredTag) {
  const { x, y, width, height } = bbox;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const tolerance = 50; // pixels

  return await page.evaluate(({ centerX, centerY, tolerance, preferredTag }) => {
    const elements = document.elementsFromPoint(centerX, centerY);

    for (const el of elements) {
      if (el.tagName === 'HTML' || el.tagName === 'BODY') continue;

      // Prefer matching tag
      if (preferredTag && el.tagName.toLowerCase() !== preferredTag) continue;

      const rect = el.getBoundingClientRect();
      const elCenterX = rect.x + rect.width / 2;
      const elCenterY = rect.y + rect.height / 2;

      // Check if within tolerance
      if (Math.abs(elCenterX - centerX) <= tolerance &&
          Math.abs(elCenterY - centerY) <= tolerance) {
        // Generate a selector for this element
        let selector = el.tagName.toLowerCase();
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.dataset.testid) {
          selector = `[data-testid="${el.dataset.testid}"]`;
        } else if (el.className) {
          const cls = el.className.split(' ')[0];
          selector = `${el.tagName.toLowerCase()}.${cls}`;
        }

        return { selector };
      }
    }

    return null;
  }, { centerX, centerY, tolerance, preferredTag });
}

/**
 * Calculate drift score between original and current element
 * @param {Object} original - Original DOM capture
 * @param {Object} current - Current element info
 * @returns {number} Drift score (0-1, lower is better)
 */
export function calculateDriftScore(original, current) {
  let score = 0;
  let weights = 0;

  // Compare tag name (weight: 0.1)
  if (original.tag_name && current.tag_name) {
    weights += 0.1;
    if (original.tag_name !== current.tag_name) {
      score += 0.1;
    }
  }

  // Compare text content (weight: 0.2)
  if (original.text_content && current.text_content) {
    weights += 0.2;
    const similarity = calculateTextSimilarity(original.text_content, current.text_content);
    score += 0.2 * (1 - similarity);
  }

  // Compare position (weight: 0.3)
  if (original.bounding_box && current.bounding_box) {
    weights += 0.3;
    const positionDrift = calculatePositionDrift(original.bounding_box, current.bounding_box);
    score += 0.3 * Math.min(1, positionDrift / 100); // Cap at 100px difference
  }

  // Compare attributes (weight: 0.4)
  if (original.attributes && current.attributes) {
    weights += 0.4;
    const attrSimilarity = calculateAttributeSimilarity(original.attributes, current.attributes);
    score += 0.4 * (1 - attrSimilarity);
  }

  return weights > 0 ? score / weights : 1;
}

/**
 * Calculate text similarity using Levenshtein distance
 */
function calculateTextSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().substring(0, 50);
  const s2 = str2.toLowerCase().substring(0, 50);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  return 1 - distance / Math.max(s1.length, s2.length);
}

/**
 * Calculate position drift in pixels
 */
function calculatePositionDrift(box1, box2) {
  const dx = Math.abs(box1.x - box2.x);
  const dy = Math.abs(box1.y - box2.y);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate attribute similarity score
 */
function calculateAttributeSimilarity(attrs1, attrs2) {
  const keys = new Set([...Object.keys(attrs1), ...Object.keys(attrs2)]);
  if (keys.size === 0) return 1;

  let matches = 0;
  for (const key of keys) {
    if (attrs1[key] === attrs2[key]) {
      matches++;
    }
  }

  return matches / keys.size;
}

/**
 * Escape text for use in CSS selectors
 */
function escapeText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * Log drift recovery attempt to console
 */
export function logDriftRecovery(result) {
  if (result.recovered) {
    console.log(`Selector drift recovery: ${result.strategy}`);
    console.log(`  Original: ${result.original_selector}`);
    console.log(`  New: ${result.new_selector}`);
    console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  } else {
    console.log(`Selector drift recovery failed for: ${result.original_selector}`);
    console.log(`  Tried ${result.alternatives_tried} strategies`);
    console.log('  Manual intervention required');
  }
}

export default {
  recoverFromDrift,
  calculateDriftScore,
  logDriftRecovery
};
