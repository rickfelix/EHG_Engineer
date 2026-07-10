/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: /learn source adapter — createFromLearn moved VERBATIM
 * from scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites return
 * {ok:false, error, exitCode} / the CLI maps them back to the historical exit codes.
 */
import { supabase } from '../context.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import { resolveVenturePrefix, createSDOrThrow as createSD } from '../pipeline.js';

/**
 * Create SD from /learn pattern
 */
export async function createFromLearn(patternId) {
  console.log(`\n📋 Creating SD from /learn pattern: ${patternId}`);

  // Fetch pattern from retrospectives or learning table
  const { data: pattern, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('id', patternId)
    .single();

  if (error || !pattern) {
    console.error('Pattern not found:', patternId);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `Pattern not found: ${patternId}`, exitCode: 1 };
  }

  // Determine type
  const type = pattern.lesson_type === 'bug' ? 'fix' : 'enhancement';

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'LEARN',
    type,
    title: pattern.key_lesson || pattern.title || 'Learning Pattern',
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: pattern.key_lesson || pattern.title,
    description: pattern.actionable_improvements?.join('\n') || pattern.description || 'Created from learning pattern',
    type,
    rationale: `Created from retrospective pattern ${patternId}`,
    metadata: {
      source: 'learn',
      source_id: patternId,
      lesson_type: pattern.lesson_type
    }
  });

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: the retrospective/pattern id (string) or { patternId }.
 */
export async function toDraft(input, _deps = {}) {
  const patternId = (input && typeof input === 'object') ? (input.patternId ?? input.id) : input;
  return createFromLearn(patternId);
}
