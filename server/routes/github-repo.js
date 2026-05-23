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
import { resolveVentureRepoUrl } from '../../lib/eva/bridge/resolve-venture-repo.js';
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

  // SD-LEO-FEAT-S19-BUILDS-INTO-001 (FR-2): if the venture already has a design
  // repo (ventures.repo_url SSOT, or the S17 github_sync capture), BUILD INTO it
  // rather than creating a blank one. Repo-less ventures fall back to create-new.
  const supabase = req.app.locals.supabase || req.supabase;
  let resolvedRepoUrl = null;
  if (supabase) {
    try {
      resolvedRepoUrl = await resolveVentureRepoUrl(supabase, ventureId);
    } catch (err) {
      console.error('[github-repo] resolveVentureRepoUrl failed (falling back to create-new):', err.message);
    }
  }

  const mode = resolvedRepoUrl ? 'build-into' : 'create-new';
  let repoUrl;
  let repoName;

  if (mode === 'build-into') {
    repoUrl = resolvedRepoUrl;
    repoName = repoUrl.match(/\/([^/]+?)(?:\.git)?$/)?.[1] || 'venture-repo';
    console.log(`[github-repo] BUILD-INTO existing repo: ${repoUrl}`);
  } else {
    // CREATE-NEW: generate a repo slug from the venture name and create it.
    repoName = (ventureName || 'venture')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    try {
      const result = execSync(
        `gh repo create rickfelix/${repoName} --public --clone=false --description "EHG venture: ${ventureName || 'Venture'}" 2>&1`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      const urlMatch = result.match(/(https:\/\/github\.com\/[^\s]+)/);
      repoUrl = urlMatch ? urlMatch[1] : `https://github.com/rickfelix/${repoName}`;
      console.log(`[github-repo] Created repo: ${repoUrl}`);
    } catch (err) {
      const msg = err.stderr || err.stdout || err.message || '';
      // FR-5 (slug-collision guard): in create-new mode the resolver found NO
      // repo for this venture, so a pre-existing rickfelix/<slug> is an UNRELATED
      // repo. Do NOT silently push venture docs into it — surface a clear error.
      if (msg.includes('already exists')) {
        console.error(`[github-repo] Slug collision: rickfelix/${repoName} already exists and is not linked to this venture`);
        return res.status(409).json({
          error: `A GitHub repo "rickfelix/${repoName}" already exists and is not linked to this venture. Rename the venture or link its repo before seeding to avoid pushing into the wrong repo.`,
          code: 'GITHUB_SLUG_COLLISION',
          repoName,
        });
      }
      console.error('[github-repo] Create failed:', msg);
      return res.status(500).json({ error: `GitHub repo creation failed: ${msg.slice(0, 200)}`, code: 'GITHUB_CREATE_FAILED' });
    }
  }

  // Seed the repo with venture docs (build-into = additive into the existing
  // repo; create-new = fresh repo). seedRepo preserves an existing replit.md and
  // never force-pushes.
  const cloneDir = join(tmpdir(), 'ehg-repo-seed-' + Date.now());
  try {
    const seedResult = await seedRepo(ventureId, repoUrl + '.git', { cloneDir, mode });
    console.log(`[github-repo] Seeded (${mode}): ${seedResult.docsCommitted.length} files, ${seedResult.errors.length} errors`);

    // Save repo URL provenance to venture_resources + advisory_data (S19 gate).
    if (supabase) {
      await supabase.from('venture_resources').upsert({
        venture_id: ventureId,
        resource_type: 'github_repo',
        resource_identifier: repoUrl,
        metadata: { created_by: 'auto', seeded: true, mode, docs_committed: seedResult.docsCommitted },
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
      mode,
      seeded: true,
      docsCommitted: seedResult.docsCommitted,
      errors: seedResult.errors,
    });
  } catch (err) {
    console.error(`[github-repo] Seed failed (${mode}):`, err.message);
    // TS-4: a build-into clone/seed failure must NOT silently fall back to
    // creating a new repo — surface it (502). create-new keeps its 200 behavior.
    return res.status(mode === 'build-into' ? 502 : 200).json({
      repoUrl,
      repoName,
      mode,
      seeded: false,
      seedError: err.message,
      docsCommitted: [],
      errors: [err.message],
    });
  }
}));

export default router;
