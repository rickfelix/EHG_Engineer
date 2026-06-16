// feedback-decision-type.mjs — SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-FEEDBACK-TYPE-001
//
// The single source of truth for the feedback.type literal emitted by the chairman
// decision-queue feedback writers (recordFlagCall, recordDeferral in
// scripts/chairman-decisions.mjs).
//
// INVARIANT: this value MUST be a member of the live feedback_type_check CHECK
// constraint allowed set {issue, enhancement}. It was previously hardcoded as
// 'improvement' in both writers — a value the constraint REJECTS — which made the
// flag-enablement and deferral decision paths 100% broken (every INSERT threw
// 'feedback violates check constraint feedback_type_check'). 'enhancement' is the
// semantically-closest allowed value for these chairman-audit rows (the durable
// discriminator for them is the category field, not the type).
//
// Extracted into this side-effect-free module (rather than inlined) so the regression
// test can import the literal directly — scripts/chairman-decisions.mjs runs its CLI at
// module top-level and cannot be safely imported by a test. The test asserts this value
// against the LIVE constraint (real INSERT probe), so a future drift to a disallowed
// value is caught.
export const CHAIRMAN_FEEDBACK_TYPE = 'enhancement';
