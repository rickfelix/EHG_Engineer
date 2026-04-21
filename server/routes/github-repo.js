/**
 * GitHub Repository Management Routes
 *
 * POST /api/github/create-and-seed — Create a GitHub repo and seed with venture docs
 *
 * @artifact-persistence-exempt — Uses seedRepo which writes directly to venture_artifacts
 */

import { Router } from 'express';
import { execSync } from 'child_process';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { isValidUuid } from '../middleware/validate.js';
import { seedRepo } from '../../lib/eva/bridge/replit-repo-seeder.js';
import { tmpdir } from 'os';
import { join } from 'path';

const router = Router();

/**
 * POST /api/github/create-and-seed
 * Creates a new GitHub repo for the venture, then seeds it with docs + designs.
 */
router.post('/create-and-seed', asyncHandler(async (req, res) => {
  const { ventureId, ventureName } = req.body || {};

  if (!ventureId || !isValidUuid(ventureId)) {
    return res.status(400).json({ error: 'ventureId is required (UUID)', code: 'INVALID_VENTURE_ID' });
  }

  // Generate repo name from venture name
  const repoName = (ventureName || 'venture')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Step 1: Create GitHub repo via gh CLI
  let repoUrl;
  try {
    const result = execSync(
      `gh repo create rickfelix/${repoName} --public --clone=false --description "EHG venture: ${ventureName || 'Venture'}" 2>&1`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    // Parse the URL from gh output
    const urlMatch = result.match(/(https:\/\/github\.com\/[^\s]+)/);
    repoUrl = urlMatch ? urlMatch[1] : `https://github.com/rickfelix/${repoName}`;
    console.log(`[github-repo] Created repo: ${repoUrl}`);
  } catch (err) {
    const msg = err.stderr || err.stdout || err.message || '';
    // Check if repo already exists
    if (msg.includes('already exists')) {
      repoUrl = `https://github.com/rickfelix/${repoName}`;
      console.log(`[github-repo] Repo already exists: ${repoUrl}`);
    } else {
      console.error('[github-repo] Create failed:', msg);
      return res.status(500).json({ error: `GitHub repo creation failed: ${msg.slice(0, 200)}`, code: 'GITHUB_CREATE_FAILED' });
    }
  }

  // Step 2: Seed the repo with venture docs + designs
  const cloneDir = join(tmpdir(), 'ehg-repo-seed-' + Date.now());
  try {
    const seedResult = await seedRepo(ventureId, repoUrl + '.git', { cloneDir });
    console.log(`[github-repo] Seeded: ${seedResult.docsCommitted.length} files, ${seedResult.errors.length} errors`);

    // Step 3: Save repo URL to venture_resources
    const supabase = req.app.locals.supabase || req.supabase;
    if (supabase) {
      await supabase.from('venture_resources').upsert({
        venture_id: ventureId,
        resource_type: 'github_repo',
        resource_identifier: repoUrl,
        metadata: { created_by: 'auto', seeded: true, docs_committed: seedResult.docsCommitted },
      }, { onConflict: 'venture_id,resource_type' });

      // Also save to advisory_data for the S19 approval gate
      const { data: existing } = await supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 19)
        .maybeSingle();
      if (existing) {
        const ad = { ...(existing.advisory_data || {}), replit_repo_url: repoUrl };
        await supabase.from('venture_stage_work')
          .update({ advisory_data: ad })
          .eq('venture_id', ventureId)
          .eq('lifecycle_stage', 19);
      }
    }

    return res.status(200).json({
      repoUrl,
      repoName,
      seeded: true,
      docsCommitted: seedResult.docsCommitted,
      errors: seedResult.errors,
    });
  } catch (err) {
    console.error('[github-repo] Seed failed:', err.message);
    // Still return the repo URL even if seeding failed
    return res.status(200).json({
      repoUrl,
      repoName,
      seeded: false,
      seedError: err.message,
      docsCommitted: [],
      errors: [err.message],
    });
  }
}));

export default router;
