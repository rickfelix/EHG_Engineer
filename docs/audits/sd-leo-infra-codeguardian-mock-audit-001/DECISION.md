# Disposition Decision: services/codeguardian-mock/

**SD**: SD-LEO-INFRA-CODEGUARDIAN-MOCK-AUDIT-001
**Decided**: 2026-05-02
**Decided by**: EXEC session ed6fcc61-fb52-4b19-9f56-19c63fddf209

**Disposition: Option A**

## Rationale

The audit (see [audit-output.json](./audit-output.json) and [AUDIT.md](./AUDIT.md)) found:

| Reference type | Count | Interpretation |
|---|---:|---|
| Static grep matches outside `services/codeguardian-mock/`, `vitest.config.js`, and the transient `.claude/tmp/` PRD-authoring temp file | **0** | No external code, config, or doc references |
| Dynamic `require()`/`import()` matches with `services/codeguardian-mock/` specifier | **0** runtime callers | The 2 raw matches are inside `.claude/tmp/insert-prd-codeguardian-mock-audit.mjs` — doc-string content from this SD's PRD authoring, not runtime callers. `.claude/tmp/` is untracked and will not be committed. |
| `docker-compose*.yml` service references at repo root | **0** | The service has its own `services/codeguardian-mock/docker-compose.yml` for local-dev only; no root-level compose stack references it |
| `package.json` workspaces refs | **0** | Not registered as a workspace |
| `.github/workflows/*.yml` refs | **0** | No CI workflow path filters or build steps reference it |
| `vitest.config.js` exclusion at line 44 | present | The exclusion this audit is closing |
| Commits to `services/codeguardian-mock/` since 2026-04-26 (when commit `7d0b8a8ff9` declared it "abandoned scaffolding") | **0** | No revival; status confirmed |

Combined with the prior LEAD evidence (multiple `SD-CODEGUARDIAN-*` child PRs closed-as-superseded, Explore-agent codebase scan during LEAD review confirming zero external imports), this is an **unambiguous Option A** case.

## Execution plan (atomic — single commit)

1. Delete `services/codeguardian-mock/` recursively (52 files, 330KB on disk).
2. Remove line `'**/services/codeguardian-mock/**',` from `vitest.config.js` exclude array.
3. Verify post-delete state: `grep -r 'codeguardian-mock' --include=*.{json,yml,yaml,js,ts,mjs,cjs} . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.worktrees --exclude-dir=.claude/tmp` returns zero matches outside `docs/audits/sd-leo-infra-codeguardian-mock-audit-001/` (the audit doc itself).
4. Run `npx vitest --run --no-coverage` to confirm exclusion removal does not introduce new failures (the directory no longer exists, so no tests can be discovered there).
5. Commit + push + open PR + monitor `test-coverage` workflow on main post-merge.

## Risk reassessment vs PRD R-1..R-6

| Risk | Audit result | Status |
|---|---|---|
| R-1 workspace/lockfile drift | Workspaces refs = 0 | **Mitigated** (no workspace registration to update) |
| R-2 docker-compose service removal | Root-level compose refs = 0 | **Mitigated** (only the service's own internal compose file is removed with the directory) |
| R-3 Downstream CI workflow ref pruning | CI workflow refs = 0 | **Mitigated** (no workflow path filters or build steps reference this service) |
| R-4 Hidden runtime dependency via dynamic require/import | 2 matches, both in untracked `.claude/tmp/` PRD authoring file | **Mitigated** (no runtime callers; matches are doc-string content from this SD's PRD) |
| R-5 Abandoned-status drift | 0 commits since 2026-04-26 | **Mitigated** (status confirmed) |
| R-6 Vitest config drift | Exclusion identified by content match (regex), not line number | **Mitigated** (audit script uses content-based detection) |

All risks reduce to LOW post-audit. Proceeding with Option A.
