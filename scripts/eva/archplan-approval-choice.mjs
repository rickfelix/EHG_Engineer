/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-2, EXEC-TO-PLAN TESTING review M4/M6):
 * pure flag-to-decision resolver for archplan-command.mjs's `upsert` subcommand,
 * extracted into its own side-effect-free module so it can be unit-tested by direct
 * import -- archplan-command.mjs itself has no isMainModule() guard and executes the
 * live CLI against process.argv on import, so it cannot be imported from a unit test.
 */
import { rejectStringFlagValue } from '../../lib/eva/vision-upsert.js';

export function resolveApprovalChoice({ approvedFlag, draftFlag }) {
  for (const [flagValue, flagName] of [[approvedFlag, '--approved'], [draftFlag, '--draft']]) {
    const err = rejectStringFlagValue(flagValue, flagName);
    if (err) return { ok: false, error: err };
  }
  if (approvedFlag && draftFlag) {
    return { ok: false, error: 'Pass only ONE of --approved or --draft, not both.' };
  }
  if (!approvedFlag && !draftFlag) {
    return { ok: false, error: 'Approval decision required: pass --approved (active + chairman_approved) or --draft (saved as draft, not approved).' };
  }
  return { ok: true, approved: Boolean(approvedFlag) };
}
