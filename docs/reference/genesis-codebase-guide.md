# Genesis Codebase Quick Reference

> **Load this when**: Working on Genesis features, auditing Genesis implementation, debugging Genesis issues

---

## Critical: Genesis Spans Two Codebases

```
/mnt/c/_EHG/
├── EHG_Engineer/           # Backend + Infrastructure
│   └── lib/genesis/        # 9 files, 2,578 LOC
│       ├── branch-lifecycle.js
│       ├── pattern-library.js
│       ├── pattern-assembler.js
│       ├── quality-gates.js
│       ├── vercel-deploy.js
│       ├── mock-mode.js
│       ├── mock-mode-injector.js
│       ├── watermark-middleware.js
│       └── ttl-cleanup.js
│
└── ehg/                    # Frontend + Pipeline
    ├── lib/genesis/        # 4 files, 1,432 LOC
    │   ├── ScaffoldEngine.js
    │   ├── vercel-deploy.js  ⚠️ DUPLICATE (different impl)
    │   ├── mock-mode-verifier.js
    │   └── repo-creator.js
    │
    └── scripts/genesis/    # 7 files, 3,822 LOC
        ├── genesis-pipeline.js      # Main entry point
        ├── genesis-gate.js          # Ratification
        ├── pattern-selector.js
        ├── seed-patterns.js
        ├── soul-extractor.js        # Stage 16
        ├── regeneration-gate.js     # Stage 16
        └── production-generator.js  # Stage 17
```

---

## Quick Lookup

| Need to... | Go to | File |
|------------|-------|------|
| Create simulation | ehg | `scripts/genesis/genesis-pipeline.js` |
| Query patterns | EHG_Engineer | `lib/genesis/pattern-library.js` |
| Run quality gates | EHG_Engineer | `lib/genesis/quality-gates.js` |
| Deploy to Vercel | Both (different impls) | `lib/genesis/vercel-deploy.js` |
| Extract soul (Stage 16) | ehg | `scripts/genesis/soul-extractor.js` |
| Generate prod code (Stage 17) | ehg | `scripts/genesis/production-generator.js` |
| Cleanup expired sims | EHG_Engineer | `lib/genesis/ttl-cleanup.js` |

---

## Known Issues

1. **PRD generation is STUBBED** - Returns hardcoded template, not LLM-generated
2. **No API entry point** - Must use CLI: `node scripts/genesis/genesis-pipeline.js`
3. **Stage 16/17 not wired** - Orchestrator uses AI CEO Agent / GTM Strategy instead
4. **Duplicate vercel-deploy.js** - Different implementations in each codebase

---

## Full Documentation

See: `docs/architecture/GENESIS_IMPLEMENTATION_GUIDE.md`
