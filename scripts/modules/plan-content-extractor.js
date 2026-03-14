/**
 * Plan Content Extractor
 *
 * Extracts structured data from architecture plan markdown content for
 * rich child SD population. Solves the "thin shell children" gap where
 * auto-generated child SDs received only phase titles instead of the
 * detailed task breakdowns, deliverables, and success criteria from
 * the architecture plan.
 *
 * Handles multiple plan formats:
 * - Task tables (pipe-delimited with various column layouts)
 * - Deliverables (bold prefix + bullets or single-line)
 * - Scope/Goal descriptions
 * - LOC/PR/SD estimates from headers
 * - Testing strategy mapped to phases
 * - Risk mitigations mapped to phases
 * - Vision success criteria mapped to phases
 *
 * @module plan-content-extractor
 */

/**
 * Extract structured details from a single phase's raw markdown content.
 *
 * @param {string} phaseContent - Raw markdown content within a phase section
 * @returns {Object} Structured phase details
 */
export function extractPhaseDetails(phaseContent, phaseTitle = '') {
  const details = {
    tasks: [],
    deliverables: [],
    scopeDescription: '',
    locEstimate: null,
    sdEstimate: null,
    filesMentioned: [],
  };

  if (!phaseContent) return details;

  const lines = phaseContent.split('\n');

  // --- Extract task table rows ---
  let inTable = false;
  let headerCells = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect table header row (contains pipes and known column keywords)
    if (!inTable && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const cellsLower = cells.map(c => c.toLowerCase());
      const isHeader = cellsLower.some(c =>
        ['task', 'child', 'description', 'files', 'loc', 'est. loc', 'risk', 'dependencies'].includes(c)
      );
      if (isHeader) {
        inTable = true;
        headerCells = cellsLower;
        continue;
      }
    }

    // Skip separator row (|---|---|...)
    if (inTable && /^\|[\s\-:|]+\|$/.test(line.trim())) continue;

    // Parse data rows
    if (inTable && line.includes('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2 && !cells[0].match(/^-+$/)) {
        const task = {};
        headerCells.forEach((header, idx) => {
          if (cells[idx]) task[header] = cells[idx];
        });

        // Normalize into consistent shape
        details.tasks.push({
          name: task.task || task.child || cells[0],
          description: task.description || task.task || cells[1] || cells[0],
          files: task.files || '',
          loc: task['est. loc'] || task.loc || '',
          risk: task.risk || '',
          dependencies: task.dependencies || ''
        });
      }
    } else if (inTable && !line.trim()) {
      inTable = false;
    }
  }

  // --- Extract deliverables ---
  let capturingDeliverables = false;
  for (const line of lines) {
    // Single-line deliverables: **Deliverables**: text or **Deliverable**: text
    const singleMatch = line.match(/\*\*Deliverables?\*\*[:\s]*(.+)/i);
    if (singleMatch && singleMatch[1].trim()) {
      details.deliverables.push(singleMatch[1].trim());
      capturingDeliverables = false;
      continue;
    }

    // Multi-line deliverables header: **Deliverables:**  (no text after)
    const headerMatch = line.match(/\*\*Deliverables?\*\*[:\s]*$/i);
    if (headerMatch) {
      capturingDeliverables = true;
      continue;
    }

    // Capture bullet items after deliverables header
    if (capturingDeliverables && line.match(/^[-*]\s+/)) {
      details.deliverables.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    // Stop capturing on empty line or non-bullet
    if (capturingDeliverables && line.trim() && !line.match(/^[-*]\s+/)) {
      capturingDeliverables = false;
    }
  }

  // --- Extract scope/goal ---
  for (const line of lines) {
    const scopeMatch = line.match(/\*\*(Scope|Goal)\*\*[:\s]*(.*)/i);
    if (scopeMatch && scopeMatch[2].trim()) {
      details.scopeDescription = scopeMatch[2].trim();
      break;
    }
  }

  // --- Extract success gate ---
  for (const line of lines) {
    const gateMatch = line.match(/\*\*Success gate\*\*[:\s]*(.*)/i);
    if (gateMatch && gateMatch[1].trim()) {
      details.deliverables.push(`Success gate: ${gateMatch[1].trim()}`);
      break;
    }
  }

  // --- Extract LOC estimate from content or title ---
  const locMatch = phaseContent.match(/~(\d+)\+?\s*LOC/i);
  if (locMatch) {
    details.locEstimate = parseInt(locMatch[1]);
  } else if (phaseTitle) {
    const titleLocMatch = phaseTitle.match(/~(\d+)\+?\s*LOC/i);
    if (titleLocMatch) details.locEstimate = parseInt(titleLocMatch[1]);
  }

  // --- Extract SD/PR estimate from content or title ---
  const sdMatch = phaseContent.match(/~?(\d+)[-–](\d+)\s*SDs/i);
  if (sdMatch) {
    details.sdEstimate = `${sdMatch[1]}-${sdMatch[2]}`;
  } else if (phaseTitle) {
    const titleSdMatch = phaseTitle.match(/~?(\d+)[-–](\d+)\s*SDs/i);
    if (titleSdMatch) details.sdEstimate = `${titleSdMatch[1]}-${titleSdMatch[2]}`;
  }
  const prMatch = phaseContent.match(/(?:Est\.\s*)?(\d+)[-–](\d+)\s*PRs/i);
  if (prMatch && !details.sdEstimate) details.sdEstimate = `${prMatch[1]}-${prMatch[2]} PRs`;

  // --- Extract files mentioned (*.tsx, *.ts, *.js etc) ---
  const filePattern = /[\w/.-]+\.(tsx?|jsx?|mjs|cjs|vue|css|scss|json|yaml|yml|sql|md)/g;
  const files = phaseContent.match(filePattern) || [];
  details.filesMentioned = [...new Set(files)];

  return details;
}

/**
 * Extract the "Testing Strategy" section from a full architecture plan
 * and map testing items to implementation phases.
 *
 * @param {string} fullContent - Full architecture plan markdown
 * @param {Array} phases - Parsed phases with {number, title, content}
 * @returns {Map<number, string[]>} Map of phase number to testing items
 */
export function extractTestingByPhase(fullContent, phases) {
  const testingMap = new Map();
  phases.forEach(p => testingMap.set(p.number, []));

  if (!fullContent) return testingMap;

  // Find the Testing Strategy section
  const testingSection = extractTopLevelSection(fullContent, 'Testing Strategy');
  if (!testingSection) return testingMap;

  // Find per-phase testing sub-sections
  // Patterns: "### Phase 1: Manual Verification", "### Phase 1", "### Unit Tests"
  const subSections = testingSection.split(/^###\s+/m).filter(Boolean);

  for (const sub of subSections) {
    const firstLine = sub.split('\n')[0].trim();

    // Try to match to a specific phase
    const phaseRef = firstLine.match(/Phase\s+(\d+)/i);
    if (phaseRef) {
      const phaseNum = parseInt(phaseRef[1]);
      if (testingMap.has(phaseNum)) {
        // Extract bullet items as testing items
        const bullets = sub.match(/^[-*]\s+(.+)$/gm) || [];
        testingMap.get(phaseNum).push(
          ...bullets.map(b => b.replace(/^[-*]\s+/, '').trim())
        );
      }
      continue;
    }

    // Generic testing sections (Unit Tests, Integration Tests, etc.)
    // Distribute to all phases or parse content for phase references
    const bullets = sub.match(/^[-*]\s+(.+)$/gm) || [];
    for (const bullet of bullets) {
      const text = bullet.replace(/^[-*]\s+/, '').trim();
      // Check if bullet text references a specific phase
      for (const phase of phases) {
        const phaseTitle = phase.title.toLowerCase();
        if (text.toLowerCase().includes(phaseTitle.split(' ')[0]) ||
            text.toLowerCase().includes(`phase ${phase.number}`)) {
          testingMap.get(phase.number).push(text);
          break;
        }
      }
    }
  }

  return testingMap;
}

/**
 * Extract the "Risk Mitigation" section from a full architecture plan
 * and map risks to implementation phases.
 *
 * @param {string} fullContent - Full architecture plan markdown
 * @param {Array} phases - Parsed phases with {number, title, content}
 * @returns {Map<number, Array<{risk: string, severity: string, mitigation: string}>>}
 */
export function extractRisksByPhase(fullContent, phases) {
  const riskMap = new Map();
  phases.forEach(p => riskMap.set(p.number, []));

  if (!fullContent) return riskMap;

  const riskSection = extractTopLevelSection(fullContent, 'Risk Mitigation');
  if (!riskSection) return riskMap;

  // Parse narrative format: ### Risk N: Title  ...  **Mitigation**: ...
  const riskBlocks = riskSection.split(/^###\s+Risk\s*\d*[:\s]*/mi).filter(Boolean);

  for (const block of riskBlocks) {
    const lines = block.split('\n');
    const riskTitle = lines[0]?.trim();
    if (!riskTitle) continue;

    // Extract mitigation
    let mitigation = '';
    const probLine = block.match(/\*\*Probability\*\*[:\s]*(.*)/i);
    const severity = probLine ? probLine[1].trim() : 'Medium';
    const mitLine = block.match(/\*\*Mitigation\*\*[:\s]*(.*)/i);
    if (mitLine) mitigation = mitLine[1].trim();

    // Also check for table-format risks: | Risk | Impact | Likelihood | Mitigation |
    const tableMatch = block.match(/\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch) {
      const riskObj = {
        risk: tableMatch[1].trim(),
        severity: tableMatch[3].trim(),
        mitigation: tableMatch[4].trim()
      };
      // Map to the phase most mentioned in the risk content
      const targetPhase = findMostRelevantPhase(block, phases);
      if (targetPhase !== null) {
        riskMap.get(targetPhase).push(riskObj);
      } else {
        // Distribute to all phases if no specific match
        phases.forEach(p => riskMap.get(p.number).push(riskObj));
      }
      continue;
    }

    // Narrative risk
    const riskObj = {
      risk: riskTitle,
      severity: severity.toLowerCase().includes('high') ? 'HIGH' :
                severity.toLowerCase().includes('low') ? 'LOW' : 'MEDIUM',
      mitigation: mitigation || 'See architecture plan for details'
    };

    // Map to the phase most mentioned
    const targetPhase = findMostRelevantPhase(block, phases);
    if (targetPhase !== null) {
      riskMap.get(targetPhase).push(riskObj);
    } else {
      // Attach to all phases as general risk
      phases.forEach(p => riskMap.get(p.number).push(riskObj));
    }
  }

  return riskMap;
}

/**
 * Extract success criteria from a vision document's markdown content.
 *
 * @param {string} visionContent - Full vision document markdown
 * @returns {string[]} Array of success criteria strings
 */
export function extractVisionCriteria(visionContent) {
  if (!visionContent) return [];

  const criteriaSection = extractTopLevelSection(visionContent, 'Success Criteria');
  if (!criteriaSection) return [];

  const criteria = [];

  // Match numbered items: "1. **text**" or "1. text"
  const numbered = criteriaSection.match(/^\d+\.\s+\*?\*?(.+?)\*?\*?\s*$/gm) || [];
  for (const item of numbered) {
    const text = item.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim();
    if (text) criteria.push(text);
  }

  // Also match bullet items
  const bullets = criteriaSection.match(/^[-*]\s+(.+)$/gm) || [];
  for (const item of bullets) {
    const text = item.replace(/^[-*]\s+/, '').trim();
    if (text && !criteria.includes(text)) criteria.push(text);
  }

  return criteria;
}

/**
 * Map vision criteria to phases based on keyword matching.
 * Each criterion is assigned to the most relevant phase.
 *
 * @param {string[]} criteria - Vision success criteria
 * @param {Array} phases - Parsed phases with {number, title, content}
 * @returns {Map<number, string[]>} Map of phase number to criteria
 */
export function mapCriteriaToPhases(criteria, phases) {
  const criteriaMap = new Map();
  phases.forEach(p => criteriaMap.set(p.number, []));

  for (const criterion of criteria) {
    const targetPhase = findMostRelevantPhase(criterion, phases);
    if (targetPhase !== null) {
      criteriaMap.get(targetPhase).push(criterion);
    } else {
      // If no specific match, assign to the last phase (it's a final outcome)
      const lastPhase = phases[phases.length - 1];
      if (lastPhase) criteriaMap.get(lastPhase.number).push(criterion);
    }
  }

  return criteriaMap;
}

/**
 * Main entry point: enrich parsed phases with all extracted structured data.
 *
 * @param {Array} rawPhases - Phases from parsePhases() with {number, title, description, content}
 * @param {string} fullPlanContent - Full architecture plan markdown content
 * @param {string|null} visionContent - Full vision document markdown content (optional)
 * @returns {Array} Enriched phases with .details, .testing, .risks, .visionCriteria
 */
export function enrichPhases(rawPhases, fullPlanContent, visionContent = null) {
  const enriched = rawPhases.map(phase => ({
    ...phase,
    details: extractPhaseDetails(phase.content, phase.title),
    testing: [],
    risks: [],
    visionCriteria: []
  }));

  // Extract testing strategy and map to phases
  const testingMap = extractTestingByPhase(fullPlanContent, rawPhases);
  for (const phase of enriched) {
    phase.testing = testingMap.get(phase.number) || [];
  }

  // Extract risk mitigations and map to phases
  const riskMap = extractRisksByPhase(fullPlanContent, rawPhases);
  for (const phase of enriched) {
    phase.risks = riskMap.get(phase.number) || [];
  }

  // Extract and map vision success criteria
  if (visionContent) {
    const criteria = extractVisionCriteria(visionContent);
    const criteriaMap = mapCriteriaToPhases(criteria, rawPhases);
    for (const phase of enriched) {
      phase.visionCriteria = criteriaMap.get(phase.number) || [];
    }
  }

  return enriched;
}

// --- Internal helpers ---

/**
 * Extract a top-level section (## heading) from markdown content.
 */
function extractTopLevelSection(content, sectionName) {
  // Normalize line endings to \n for consistent regex matching (handles CRLF on Windows)
  const normalized = content.replace(/\r\n/g, '\n');
  // Find the section header, then capture everything until the next ## heading (not ###)
  // Note: Cannot use $ in lookahead with 'm' flag (it matches every line ending, not just string end)
  const headerPattern = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, 'mi');
  const headerMatch = headerPattern.exec(normalized);
  if (!headerMatch) return null;

  const startIdx = headerMatch.index + headerMatch[0].length;
  // Find the next ## heading that is exactly 2 hashes (not ### or more)
  const rest = normalized.slice(startIdx);
  const nextH2 = rest.search(/\n## [^#]/);
  const sectionContent = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  return sectionContent.trim() || null;
}

/**
 * Find the phase number most referenced in a text block.
 */
function findMostRelevantPhase(text, phases) {
  const textLower = text.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const phase of phases) {
    let score = 0;

    // Direct phase number reference
    if (textLower.includes(`phase ${phase.number}`)) score += 3;

    // Phase title word matches
    const titleWords = phase.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const word of titleWords) {
      if (textLower.includes(word)) score += 1;
    }

    // Content keyword overlap (check tasks/file names in phase content)
    if (phase.content) {
      const phaseContentLower = phase.content.toLowerCase();
      // If text mentions specific items from this phase
      const phaseWords = phaseContentLower.match(/\b\w{5,}\b/g) || [];
      const uniqueWords = [...new Set(phaseWords)].slice(0, 20);
      for (const word of uniqueWords) {
        if (textLower.includes(word)) score += 0.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = phase.number;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  extractPhaseDetails,
  extractTestingByPhase,
  extractRisksByPhase,
  extractVisionCriteria,
  mapCriteriaToPhases,
  enrichPhases
};
