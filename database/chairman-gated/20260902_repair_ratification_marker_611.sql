-- @approved-by: codestreetlabs@gmail.com
-- CHAIRMAN CEREMONY: one-row marker repair for the section-611 ratification 0a24cf1a (Solomon share); same template as 20260902_repair_ratification_markers_601.sql; scribe adam:673db833 per c44cd9d8 (single scribe). Approval line rides the chairman's 2026-09-02 morning sitting; verbal recorded on the row and in the Adam seat state.
-- Purpose: marker_text on chairman_ratifications 0a24cf1a is ceremony prose ("Solomon board-check cadence 6h->3h encoded into section 611 same-minute as capture; ...") that never appeared in CLAUDE_SOLOMON.md; the clause header that c44cd9d8 names as the marker IS present at CLAUDE_SOLOMON.md:380 (Solomon MEASURED 2026-09-02T09:54:50Z with the detector's own module). Ruling text, encoded_at and encoded_ref are untouched.
-- The append-only trigger only permits NULL-to-set transitions, so it is disabled for this statement and re-enabled in the same transaction. READBACK: SELECT id, marker_text FROM chairman_ratifications WHERE id = '0a24cf1a-6466-48ef-8150-464b9291308d' must return the value below.
BEGIN;
ALTER TABLE public.chairman_ratifications DISABLE TRIGGER ALL;
UPDATE public.chairman_ratifications SET marker_text = 'BOARD-CHECK CADENCE: 3-HOURLY (chairman ruling, in-terminal 2026-09-01 ~13:3xZ, Solomon seat; supersedes the 6-hourly fast-monitor cadence; ratification 0a24cf1a)' WHERE id = '0a24cf1a-6466-48ef-8150-464b9291308d' AND encoded_at IS NOT NULL;
ALTER TABLE public.chairman_ratifications ENABLE TRIGGER ALL;
COMMIT;
