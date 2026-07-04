/**
 * Artifact Integrity Checker — queries venture_artifacts to verify
 * each stage produced non-trivial artifacts with real content.
 * Deterministic, zero LLM cost.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
import { getStageRange } from './stage-config.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const MIN_CONTENT_LENGTH = 100;

/**
 * Check artifact integrity for a range of stages
 * @param {string} ventureId
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to check results
 */
export async function checkArtifactIntegrity(ventureId, fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const results = {};

  const allArtifactTypes = Object.values(stageConfigs)
    .flatMap(c => c.requiredArtifacts)
    .flatMap(r => (r && typeof r === 'object' && Array.isArray(r.anyOf)) ? r.anyOf : [r])
    .filter(Boolean);

  const { data: artifacts, error } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, content, quality_score, validation_status, created_at')
    .eq('venture_id', ventureId)
    .in('artifact_type', allArtifactTypes.length > 0 ? allArtifactTypes : ['__none__']);

  if (error) throw new Error(`Artifact query failed: ${error.message}`);

  const artifactMap = {};
  for (const a of (artifacts || [])) {
    artifactMap[a.artifact_type] = a;
  }

  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const checks = [];

    for (const requiredType of config.requiredArtifacts) {
      // QF-20260703-439: an anyOf group is satisfied if ANY listed artifact has real
      // content + a quality score -- e.g. distribution_channel_config OR distribution_ad_copy
      // (a paid-ads artifact chairman-ratified organic-only ventures never produce).
      if (requiredType && typeof requiredType === 'object' && Array.isArray(requiredType.anyOf)) {
        const group = requiredType.anyOf;
        const satisfied = group.find((t) => {
          const a = artifactMap[t];
          return a && a.content && a.content.length >= MIN_CONTENT_LENGTH && a.quality_score != null;
        });
        checks.push({
          name: `artifact_anyOf:${group.join('|')}`,
          pass: Boolean(satisfied),
          detail: satisfied
            ? `Satisfied by "${satisfied}" (${artifactMap[satisfied].content.length} chars, quality ${artifactMap[satisfied].quality_score})`
            : `None of [${group.join(', ')}] found with sufficient content + quality score`
        });
        continue;
      }

      const artifact = artifactMap[requiredType];

      if (!artifact) {
        checks.push({ name: `artifact_exists:${requiredType}`, pass: false, detail: `Required artifact "${requiredType}" not found` });
        continue;
      }

      const contentLength = artifact.content ? artifact.content.length : 0;
      checks.push({
        name: `artifact_substance:${requiredType}`,
        pass: contentLength >= MIN_CONTENT_LENGTH,
        detail: contentLength >= MIN_CONTENT_LENGTH
          ? `Content length ${contentLength} chars`
          : contentLength === 0 ? 'Artifact has NULL/empty content' : `Content too short: ${contentLength} chars (min ${MIN_CONTENT_LENGTH})`
      });

      checks.push({
        name: `artifact_quality:${requiredType}`,
        pass: artifact.quality_score != null,
        detail: artifact.quality_score != null ? `Quality score: ${artifact.quality_score}` : 'No quality score assigned'
      });
    }

    if (config.requiredArtifacts.length === 0) {
      checks.push({ name: 'no_artifacts_required', pass: true, detail: 'Stage has no required artifacts' });
    }

    results[stageNum] = {
      stage_number: parseInt(stageNum),
      stage_name: config.name,
      checks,
      pass_count: checks.filter(c => c.pass).length,
      fail_count: checks.filter(c => !c.pass).length
    };
  }

  return results;
}
