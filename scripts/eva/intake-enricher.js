#!/usr/bin/env node
/**
 * Intake Enrichment Module
 * SD: SD-DISTILL-PIPELINE-CHAIRMAN-REVIEW-ORCH-001-A
 *
 * Enriches eva_todoist_intake items before classification by:
 * 1. Extracting YouTube video IDs from titles (url-extractor.js)
 * 2. Fetching video metadata (video-metadata.js)
 * 3. Cross-linking with eva_youtube_intake (dedup-checker.js)
 * 4. Summarizing non-YouTube web pages via LLM
 * 5. Setting enrichment_status and enrichment_summary
 *
 * All external fetches use fail-open pattern — never blocks the pipeline.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { extractYouTubeVideoId, extractYouTubeUrl, extractYouTubePlaylistId } from '../../lib/integrations/url-extractor.js';

// Lazy imports for YouTube metadata + video analysis
let _fetchVideoMetadata = null;
let _analyzeVideoContent = null;

async function lazyFetchVideoMetadata(videoId, options) {
  if (!_fetchVideoMetadata) {
    try {
      const mod = await import('../../lib/integrations/youtube/video-metadata.js');
      _fetchVideoMetadata = mod.fetchVideoMetadata;
      _analyzeVideoContent = mod.analyzeVideoContent;
    } catch (err) {
      console.error(`    video-metadata.js import failed: ${err.message}`);
      return null;
    }
  }
  return _fetchVideoMetadata(videoId, options);
}

// eslint-disable-next-line no-unused-vars -- called from /distill skill Step 2d
async function lazyAnalyzeVideoContent(videoId, options) {
  if (!_analyzeVideoContent) {
    try {
      const mod = await import('../../lib/integrations/youtube/video-metadata.js');
      _analyzeVideoContent = mod.analyzeVideoContent;
    } catch (err) {
      if (options?.verbose) console.log(`    video analysis import failed: ${err.message}`);
      return null;
    }
  }
  return _analyzeVideoContent(videoId, options);
}

let _checkDuplicate = null;
async function lazyCheckDuplicate(title, options) {
  if (!_checkDuplicate) {
    try {
      const mod = await import('../../lib/integrations/dedup-checker.js');
      _checkDuplicate = mod.checkDuplicate;
    } catch (err) {
      console.error(`    dedup-checker.js import failed: ${err.message}`);
      return null;
    }
  }
  return _checkDuplicate(title, options);
}

const supabase = createSupabaseServiceClient();

/**
 * Extract the first URL from text (any URL, not just YouTube).
 * @param {string} text
 * @returns {string|null}
 */
function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s,)>\]]+/i);
  return match ? match[0] : null;
}

/**
 * Domains known to be SPA-rendered or auth-walled, where server-side
 * fetch cannot extract meaningful text content.
 */
const SPA_DOMAINS = [
  'dropbox.com', 'www.dropbox.com',
  'g.co',                            // Gemini short links
  'gemini.google.com',
  'claude.ai',
  'chatgpt.com', 'chat.openai.com',
  'dev.runwayml.com',
];

/**
 * Check if a URL belongs to a known SPA/auth-walled domain.
 * @param {string} url
 * @returns {string|null} Domain name if SPA, null otherwise
 */
function isSPADomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return SPA_DOMAINS.find(d => hostname === d || hostname.endsWith('.' + d)) || null;
  } catch { return null; }
}

/**
 * Summarize a web page via LLM single-shot.
 * Fail-open: returns null on any error.
 * @param {string} url
 * @param {boolean} verbose
 * @returns {Promise<string|null>}
 */
async function summarizeWebPage(url, verbose = false) {
  try {
    // Check for known SPA/auth-walled domains first
    const spaDomain = isSPADomain(url);
    if (spaDomain) {
      if (verbose) console.log(`    SPA domain detected (${spaDomain}), skipping fetch for ${url}`);
      return `External link: ${spaDomain} (requires browser/authentication)`;
    }

    // Fetch web page content with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EHG-EVA-Enricher/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      if (verbose) console.log(`    Web fetch failed: ${response.status} for ${url}`);
      return null;
    }

    const html = await response.text();
    // Extract readable text from HTML (strip tags, limit length)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    if (text.length < 50) {
      if (verbose) console.log(`    Web content too short for ${url}`);
      return null;
    }

    // Use LLM to summarize (dynamic import to avoid circular deps)
    const { getLLMClient } = await import('../../lib/llm/client-factory.js');
    const client = getLLMClient({ purpose: 'fast' });

    const result = await client.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `Summarize this web page content in 2-3 sentences for strategic evaluation. Focus on what it's about and why it might be valuable:\n\n${text}`,
        },
      ],
      max_tokens: 200,
    });

    const summary = result?.choices?.[0]?.message?.content || null;

    if (verbose && summary) console.log(`    Web summary: ${summary.slice(0, 80)}...`);
    return summary;
  } catch (err) {
    if (verbose) console.log(`    Web summarize failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Build enrichment summary from YouTube metadata.
 * @param {object} metadata - From fetchVideoMetadata()
 * @returns {string}
 */
function buildYouTubeSummary(metadata) {
  const parts = [];
  if (metadata.title) parts.push(`Video: "${metadata.title}"`);
  if (metadata.channelName) parts.push(`Channel: ${metadata.channelName}`);
  if (metadata.durationSeconds) {
    const mins = Math.round(metadata.durationSeconds / 60);
    parts.push(`Duration: ${mins}min`);
  }
  if (metadata.tags?.length > 0) {
    parts.push(`Tags: ${metadata.tags.slice(0, 5).join(', ')}`);
  }
  if (metadata.description) {
    const desc = metadata.description.slice(0, 200).replace(/\n/g, ' ');
    parts.push(`Description: ${desc}`);
  }
  return parts.join(' | ');
}

/**
 * Enrich all pending items in eva_todoist_intake.
 *
 * @param {object} [options]
 * @param {boolean} [options.verbose=false]
 * @param {number} [options.limit=500]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{enriched: number, failed: number, skipped: number}>}
 */
export async function enrichItems(options = {}) {
  const { verbose = false, limit = 500, dryRun = false } = options;
  const counts = { enriched: 0, failed: 0, skipped: 0 };

  // Fetch items needing enrichment
  const { data: items, error } = await supabase
    .from('eva_todoist_intake')
    .select('id, title, description, extracted_youtube_id, extracted_youtube_url, youtube_intake_id, status')
    .eq('enrichment_status', 'pending')
    .neq('status', 'error')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('  Error fetching pending items:', error.message);
    return counts;
  }

  if (!items || items.length === 0) {
    if (verbose) console.log('  No pending enrichment items found.');
    return counts;
  }

  console.log(`  Enriching ${items.length} items...`);

  for (const item of items) {
    try {
      const text = `${item.title || ''} ${item.description || ''}`;
      let enrichmentSummary = null;
      let enrichmentStatus = 'enriched';

      // --- YouTube path ---
      const videoId = extractYouTubeVideoId(text);

      if (videoId) {
        if (verbose) console.log(`    [${item.id.slice(0, 8)}] YouTube: ${videoId}`);

        // Update extracted fields if not already set
        const updateFields = {};
        if (!item.extracted_youtube_id) {
          updateFields.extracted_youtube_id = videoId;
          updateFields.extracted_youtube_url = extractYouTubeUrl(text);
        }

        // Fetch metadata (fail-open)
        const metadata = await lazyFetchVideoMetadata(videoId, { verbose });
        if (metadata) {
          enrichmentSummary = buildYouTubeSummary(metadata);
        } else {
          enrichmentSummary = `YouTube video: ${videoId} (metadata unavailable)`;
        }

        // Note: Gemini video analysis runs AFTER chairman review (in /distill skill)
        // so the chairman's intent can guide what Gemini focuses on

        // Cross-link with eva_youtube_intake
        if (!item.youtube_intake_id) {
          try {
            const dedupResult = await lazyCheckDuplicate(item.title, {
              supabase,
              sourceType: 'youtube',
              youtubeVideoId: videoId,
            });
            if (dedupResult?.bestMatch?.id) {
              updateFields.youtube_intake_id = dedupResult.bestMatch.id;
              if (verbose) console.log(`    Cross-linked to YouTube intake: ${dedupResult.bestMatch.id.slice(0, 8)}`);
            }
          } catch (dedupErr) {
            if (verbose) console.log(`    Cross-link failed: ${dedupErr.message}`);
          }
        }

        // Apply YouTube-specific field updates
        if (Object.keys(updateFields).length > 0 && !dryRun) {
          await supabase
            .from('eva_todoist_intake')
            .update(updateFields)
            .eq('id', item.id);
        }
      } else if (extractYouTubePlaylistId(text)) {
        // --- YouTube playlist path ---
        const playlistId = extractYouTubePlaylistId(text);
        if (verbose) console.log(`    [${item.id.slice(0, 8)}] YouTube playlist: ${playlistId}`);
        const playlistUrl = extractFirstUrl(text) || `https://www.youtube.com/playlist?list=${playlistId}`;
        enrichmentSummary = `YouTube playlist: ${playlistUrl}`;
      } else {
        // --- Non-YouTube URL path ---
        const url = extractFirstUrl(text);

        if (url) {
          if (verbose) console.log(`    [${item.id.slice(0, 8)}] Web: ${url}`);
          enrichmentSummary = await summarizeWebPage(url, verbose);
          if (!enrichmentSummary) {
            enrichmentSummary = `Web link: ${url} (content unavailable)`;
            enrichmentStatus = 'failed';
          }
        } else {
          // --- No URL path: summarize from title + description ---
          if (verbose) console.log(`    [${item.id.slice(0, 8)}] Text-only`);
          if (item.description && item.description.length > 50) {
            try {
              const { getLLMClient } = await import('../../lib/llm/client-factory.js');
              const client = getLLMClient({ purpose: 'fast' });
              const result = await client.chat.completions.create({
                messages: [
                  {
                    role: 'user',
                    content: `Summarize this idea in 2-3 sentences for strategic evaluation. Focus on what is being proposed and why it matters:\n\nTitle: ${item.title}\n\nDescription: ${item.description.slice(0, 3000)}`,
                  },
                ],
                max_tokens: 200,
              });
              enrichmentSummary = result?.choices?.[0]?.message?.content || `Intake item: ${item.title || 'untitled'}`;
            } catch (llmErr) {
              if (verbose) console.log(`    LLM summary failed: ${llmErr.message}`);
              enrichmentSummary = `Intake item: ${item.title || 'untitled'}`;
            }
          } else {
            enrichmentSummary = `Intake item: ${item.title || 'untitled'}`;
          }
        }
      }

      // Update enrichment fields
      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from('eva_todoist_intake')
          .update({
            enrichment_status: enrichmentStatus,
            enrichment_summary: enrichmentSummary,
          })
          .eq('id', item.id);

        if (updateErr) {
          console.error(`    Update failed for ${item.id}: ${updateErr.message}`);
          counts.failed++;
          continue;
        }
      }

      if (enrichmentStatus === 'enriched') {
        counts.enriched++;
      } else {
        counts.failed++;
      }
    } catch (err) {
      // Fail-open: log and continue to next item
      console.error(`    Enrichment error for ${item.id}: ${err.message}`);

      if (!dryRun) {
        await supabase
          .from('eva_todoist_intake')
          .update({ enrichment_status: 'failed' })
          .eq('id', item.id);
      }
      counts.failed++;
    }
  }

  return counts;
}

// CLI entry point
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` ||
                     import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}` ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`)) {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const dryRun = process.argv.includes('--dry-run');
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 500 : 500;

  console.log('\n🔍 EVA Intake Enricher');
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Limit: ${limit}\n`);

  enrichItems({ verbose, limit, dryRun }).then((counts) => {
    console.log(`\n✅ Enrichment complete: ${counts.enriched} enriched, ${counts.failed} failed, ${counts.skipped} skipped`);
  });
}
