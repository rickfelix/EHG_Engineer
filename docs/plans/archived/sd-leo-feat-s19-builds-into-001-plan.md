<!-- Archived from: C:/Users/rickf/.claude/plans/s19-build-into-s17-design-repo.md -->
<!-- SD Key: SD-LEO-FEAT-S19-BUILDS-INTO-001 -->
<!-- Archived at: 2026-05-23T13:51:23.564Z -->

# S19 builds into the venture's S17 design repo instead of creating a blank one

## Type
feature

## Priority
high

## Target Application
EHG_Engineer

## Summary
At Stage 17, a venture's design is captured as a GitHub repo (e.g. Canvas AI → rickfelix/contribution-hub, a real working Lovable app: Vite + TypeScript + TanStack Router + shadcn, 7 routed pages, a design system) and stored in venture_artifacts(artifact_type='s17_approved').metadata.lovable_artifact as a github_sync entry. At Stage 19 the "Create & Seed GitHub Repository" button creates a NEW blank repo (rickfelix/<venture-slug>) and seeds only markdown docs into it, ignoring the S17 design repo. The result: the design work is abandoned and the Replit build starts from scratch instead of continuing from the working prototype. This SD makes Stage 19 build INTO the venture's existing S17 design repo — seeding additive docs/ on the main branch — so the build continues from the design. Decision (chairman): the build proceeds in Replit (not Lovable), so seeding additive docs/ into main is safe and non-destructive.

## Strategic Objectives
- Stop abandoning the S17 design at build time: the Replit build must continue from the venture's actual design repo, not a blank one.
- Establish ventures.repo_url as the single source of truth for the venture's git repo (FR-1, shipped ehg PR #635).
- Make the Stage-19 build path consistent across all ventures: reuse the existing repo when one exists; create-new only as a fallback for repo-less ventures.

## Key Changes
| File | Action | Purpose |
|------|--------|---------|
| `ehg/supabase/migrations/20260523120000_ssot_venture_repo_url_from_s17.sql` | CREATE | FR-1 (DONE, ehg PR #635): trigger + backfill populating ventures.repo_url from the S17 github_sync capture |
| `EHG_Engineer/lib/eva/bridge/resolve-venture-repo.js` | CREATE | FR-2: resolveVentureRepoUrl = ventures.repo_url ?? normalized S17 artifact repo |
| `EHG_Engineer/server/routes/github-repo.js` | MODIFY | FR-2: when an existing repo resolves, skip gh-repo-create and use build-into mode |
| `EHG_Engineer/lib/eva/bridge/replit-repo-seeder.js` | MODIFY | FR-2: build-into mode — authenticated clone of the private repo, additive docs/ on main, preserve existing replit.md, never force-push |
| `ehg/src/components/stages/shared/BuildMethodSelector.tsx` | MODIFY | FR-3: Stage-19 UI reflects "seed into existing repo" when ventures.repo_url is set |

## Success Criteria
- For a venture with ventures.repo_url set, S19 "Create & Seed" seeds docs additively into that existing repo with NO new repo created (gh repo create is not invoked).
- The existing repo's files are preserved: the Lovable-generated root replit.md is not overwritten; docs/ is additive on main; the seeder never force-pushes.
- The build path (Open in Replit / build-method) targets the existing repo via ventures.repo_url.
- For a repo-less venture, the current create-new behavior is preserved as a fallback.
- Validated end-to-end against a throwaway private repo before any live venture; never tested destructively against contribution-hub.

## Risks
- HIGH blast radius: changes the Stage-19 build path for every venture.
- Private-repo git auth: cloning and pushing a private repo server-side must be authenticated (verify the existing credential helper covers same-owner private repos).
- Pushes to live GitHub repos: must be additive and must never force-push; validate on a throwaway repo first.
- Cross-repo coordination: requires both an EHG_Engineer PR (resolver/route/seeder) and an EHG PR (frontend).

## Tasks
- [ ] FR-1 SSOT: ventures.repo_url populated from S17 capture (DONE — ehg PR #635, applied to dedlbzhpgkmetvhbkyzq)
- [ ] FR-2 resolveVentureRepoUrl helper + github-repo.js build-into branch (skip gh-repo-create when a repo exists)
- [ ] FR-2 replit-repo-seeder.js build-into mode: authenticated private clone, additive docs/ on main, preserve replit.md, never force-push
- [ ] FR-3 BuildMethodSelector.tsx reflects "seed into existing repo" when ventures.repo_url is set
- [ ] FR-4 seeder design-copy fallback for repo-less ventures (lower priority)
- [ ] FR-5 slug-collision guard on the create-new path
- [ ] Validate end-to-end against a throwaway private repo (never force-push, never destructive against contribution-hub)
