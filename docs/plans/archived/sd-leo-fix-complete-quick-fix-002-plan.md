<!-- Archived from: C:/Users/rickf/.claude/plans/sd-qf-doc-loc-cap.md -->
<!-- SD Key: SD-LEO-FIX-COMPLETE-QUICK-FIX-002 -->
<!-- Archived at: 2026-06-09T15:01:02.954Z -->

# complete-quick-fix.js: exclude documentation LOC from the 75 source-LOC cap

## Type
fix

## Priority
low

## Target Application
EHG_Engineer

## Summary
`complete-quick-fix.js` counts documentation lines toward the 75 source-LOC cap, which forces `--force-complete` on legitimate documentation-type QFs that commit a pre-authored draft (e.g. QF-20260609-874 committed a 127-line `docs/protocol/README.md` -> 151 "source LOC" -> hard block). Test files are already excluded from the cap; documentation should get the same treatment. Either exclude `.md`-only diff lines from the source-LOC count, or honor the QF's declared `type=documentation`. Low priority — `--force-complete` is a working escape hatch — but the false block adds friction on every doc QF.

## Scope
Edits confined to `scripts/complete-quick-fix.js` (and its LOC-counting helper if separate): in the source-LOC computation, exclude documentation lines the same way test files are already excluded — by file extension (`.md`/docs paths) and/or by honoring a QF whose declared type is `documentation`. Do not change the cap value or the test-exclusion logic.

## Key Principles
- Mirror the EXISTING test-file exclusion mechanism rather than inventing a new classification.
- Conservative: only documentation/markdown diff lines are exempted; mixed code+doc QFs still count their code lines.
- Keep `--force-complete` working as the fallback.

## Acceptance
- A documentation-only QF (.md diffs) no longer trips the 75 source-LOC cap
- A code QF still counts its source lines normally (no regression to the cap for code)
- A mixed QF counts only its non-doc, non-test source lines
- Existing complete-quick-fix tests still pass; new behavior covered by a test

## Risks
- Over-exemption letting large code changes slip the cap if mis-classified as docs (mitigation: classify by extension/path, not by QF self-declaration alone, or require both)
- Drift from the test-exclusion path if implemented separately (mitigation: reuse the same exclusion list/helper)

## Smoke Test Steps
1. Run completer on a QF whose diff is a 120-line .md file -> completes without --force-complete
2. Run completer on a QF whose diff is 120 lines of .js -> still blocked by the cap
3. Run completer on the existing test fixtures -> unchanged results

## Success Metrics
- Doc-only QFs requiring --force-complete due to LOC cap: target 0
- Code-QF cap behavior: unchanged (regression target 0)
