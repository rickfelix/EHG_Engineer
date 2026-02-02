/**
 * Spec Drift Discovery Routine
 * SD-LEO-SELF-IMPROVE-002B: Phase 2 - Self-Discovery Infrastructure
 *
 * Detects drift between PRD specifications and actual code implementation.
 * Identifies where code has diverged from documented requirements.
 */

import { DiscoveryRoutine, routineRegistry, SEVERITY_LEVELS, EVIDENCE_TYPES } from '../routineFramework.js';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import glob from 'glob';

/**
 * Spec Drift Detection Routine
 * Compares PRD functional requirements against implemented code
 */
class SpecDriftRoutine extends DiscoveryRoutine {
  constructor() {
    super({
      key: 'spec_drift',
      name: 'Specification Drift Detector',
      description: 'Detects drift between PRD requirements and code implementation'
    });

    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Execute spec drift detection
   */
  async execute(options) {
    const { mode, repoRef, commitSha } = options;
    this.validateMode(mode);

    const findings = [];

    try {
      // Get active PRDs with functional requirements
      const prds = await this.fetchActivePrds();
      console.log(`[spec_drift] Analyzing ${prds.length} PRD(s) for drift...`);

      for (const prd of prds) {
        const prdFindings = await this.analyzePrd(prd, { mode, repoRef, commitSha });
        findings.push(...prdFindings);
      }
    } catch (error) {
      console.error(`[spec_drift] Error: ${error.message}`);
    }

    return findings;
  }

  /**
   * Fetch active PRDs from database
   */
  async fetchActivePrds() {
    const { data, error } = await this.supabase
      .from('product_requirements_v2')
      .select(`
        id,
        sd_id,
        functional_requirements,
        technical_architecture,
        acceptance_criteria,
        status
      `)
      .in('status', ['approved', 'in_progress', 'completed']);

    if (error) {
      console.error('[spec_drift] Database error:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Analyze a single PRD for drift
   */
  async analyzePrd(prd, { mode, repoRef, commitSha }) {
    const findings = [];

    // Skip PRDs without functional requirements
    if (!prd.functional_requirements || !Array.isArray(prd.functional_requirements)) {
      return findings;
    }

    for (const req of prd.functional_requirements) {
      if (!req.description && !req.requirement) continue;

      const reqText = req.description || req.requirement;
      const reqId = req.id || req.key || `FR-${prd.id.slice(0, 8)}`;

      // Look for implementation evidence
      const implementation = await this.findImplementation(reqText, req);

      if (!implementation.found) {
        // Drift detected: requirement exists but no implementation found
        findings.push(this.createFinding({
          title: `Missing implementation for ${reqId}`,
          summary: `PRD requirement "${reqText.slice(0, 100)}..." has no corresponding implementation found in codebase.`,
          severity: this.calculateSeverity(req),
          confidence: 0.7,
          evidencePack: [
            {
              path: 'database/product_requirements_v2',
              line_start: 1,
              line_end: 1,
              snippet: JSON.stringify(req, null, 2).slice(0, 500),
              evidence_type: EVIDENCE_TYPES.DOC
            },
            // Add placeholder implementation evidence
            {
              path: implementation.searchedPath || 'src/',
              line_start: 1,
              line_end: 1,
              snippet: `// Expected implementation for: ${reqText.slice(0, 100)}`,
              evidence_type: EVIDENCE_TYPES.IMPLEMENTATION
            }
          ],
          repoRef,
          commitSha,
          mode,
          metadata: {
            prd_id: prd.id,
            requirement_id: reqId,
            requirement_text: reqText,
            search_keywords: implementation.keywords
          }
        }));
      } else if (implementation.partial) {
        // Partial implementation detected
        findings.push(this.createFinding({
          title: `Partial implementation for ${reqId}`,
          summary: `PRD requirement partially implemented. Found ${implementation.matchCount} references but expected more complete coverage.`,
          severity: SEVERITY_LEVELS.MEDIUM,
          confidence: 0.6,
          evidencePack: [
            {
              path: 'database/product_requirements_v2',
              line_start: 1,
              line_end: 1,
              snippet: JSON.stringify(req, null, 2).slice(0, 300),
              evidence_type: EVIDENCE_TYPES.DOC
            },
            ...implementation.evidence.slice(0, 3) // Include up to 3 implementation evidences
          ],
          repoRef,
          commitSha,
          mode,
          metadata: {
            prd_id: prd.id,
            requirement_id: reqId,
            match_count: implementation.matchCount
          }
        }));
      }
    }

    return findings;
  }

  /**
   * Find implementation evidence for a requirement
   */
  async findImplementation(reqText, req) {
    const keywords = this.extractKeywords(reqText);
    const result = {
      found: false,
      partial: false,
      matchCount: 0,
      keywords,
      evidence: [],
      searchedPath: 'src/'
    };

    if (keywords.length === 0) {
      return result;
    }

    // Search in likely implementation directories
    const searchDirs = ['src/', 'lib/', 'scripts/', 'components/'];

    for (const dir of searchDirs) {
      const dirPath = resolve(this.repoRoot, dir);
      if (!existsSync(dirPath)) continue;

      result.searchedPath = dir;

      try {
        // Search for files containing keywords
        const files = await glob(`${dir}**/*.{js,jsx,ts,tsx}`, {
          cwd: this.repoRoot,
          ignore: ['**/node_modules/**', '**/*.test.*', '**/*.spec.*']
        });

        for (const file of files.slice(0, 50)) { // Limit to prevent long scans
          const fullPath = resolve(this.repoRoot, file);
          if (!existsSync(fullPath)) continue;

          const content = readFileSync(fullPath, 'utf8');
          const matchedKeywords = keywords.filter(kw =>
            content.toLowerCase().includes(kw.toLowerCase())
          );

          if (matchedKeywords.length >= Math.ceil(keywords.length * 0.5)) {
            result.found = true;
            result.matchCount++;

            // Find the line with best match
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (matchedKeywords.some(kw => lines[i].toLowerCase().includes(kw.toLowerCase()))) {
                result.evidence.push({
                  path: file,
                  line_start: i + 1,
                  line_end: Math.min(i + 5, lines.length),
                  snippet: lines.slice(i, i + 5).join('\n').slice(0, 300),
                  evidence_type: EVIDENCE_TYPES.IMPLEMENTATION
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[spec_drift] Error scanning ${dir}: ${error.message}`);
      }
    }

    // Partial if we found some but not enough matches
    if (result.matchCount > 0 && result.matchCount < 3) {
      result.partial = true;
    }

    return result;
  }

  /**
   * Extract searchable keywords from requirement text
   */
  extractKeywords(text) {
    if (!text) return [];

    // Remove common words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'during', 'before', 'after', 'above', 'below', 'between', 'under',
      'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'not', 'only', 'same', 'than', 'too', 'very',
      'just', 'also', 'now', 'user', 'system', 'data', 'able', 'must'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    // Return unique keywords (max 5)
    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Calculate severity based on requirement properties
   */
  calculateSeverity(req) {
    if (req.priority === 'critical' || req.priority === 'high') {
      return SEVERITY_LEVELS.HIGH;
    }
    if (req.priority === 'low') {
      return SEVERITY_LEVELS.LOW;
    }
    return SEVERITY_LEVELS.MEDIUM;
  }
}

// Create and register the routine
const specDriftRoutine = new SpecDriftRoutine();
routineRegistry.register(specDriftRoutine);

export default specDriftRoutine;
