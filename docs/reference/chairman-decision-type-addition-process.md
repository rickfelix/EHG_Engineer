# Adding a new chairman decision type

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-147
**Last Updated**: 2026-09-12
**Tags**: chairman-decisions, eva, database, process

When an EVA stage needs a new decision-type value (e.g. a new gate verdict beyond
`pass`/`revise`/`kill`), follow this order — **never** change the live database
constraint first and write the migration file afterward:

1. **Update the EVA stage template.** Add the new value to the stage's decision-type
   declaration (e.g. `lib/eva/stage-templates/stage-03.js`'s `decision: { type: 'enum',
   values: [...] }` field, for the stages that use this shape — see the caveat below for
   stages that don't).
2. **Update the CHECK constraint.** Add the same value to
   `chairman_decisions_decision_check` on the `chairman_decisions.decision` column.
3. **Commit the migration file documenting the constraint change**, in the same PR as
   steps 1–2, before (or atomically with) any live apply — not after.

Run `node scripts/verify-chairman-decision-constraint-sync.mjs` after step 2 to confirm
the stage templates it can check (see below) and the live constraint agree.

## Caveat: not every stage uses the same field name

Only stages `3`, `5`, and `13` currently declare their decision-type values under the
single, unambiguous `decision: { type: 'enum', values: [...] }` shape that
`verify-chairman-decision-constraint-sync.mjs` checks. Other stages named in the
constraint's own history (`17`, `19`, `20`, `21`, `22`, `23`, `25`) use different field
names (e.g. stage 17's `gate_recommendation`, stage 20's `verdict`) or no longer declare
one in their current template at all — several of those stage numbers have also been
renumbered since the constraint's originating migration
(`supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql`) was written.

If you're adding a value for one of those stages, the sync script will not catch drift
for it — verify the constraint manually against that stage's actual current
decision-bearing field before committing.
