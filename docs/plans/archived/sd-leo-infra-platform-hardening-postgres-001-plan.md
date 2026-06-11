<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/adam-plans/pg-platform.md -->
<!-- SD Key: SD-LEO-INFRA-PLATFORM-HARDENING-POSTGRES-001 -->
<!-- Archived at: 2026-06-08T22:08:35.971Z -->

# Platform hardening — Postgres security upgrade (coordinated window) + enable leaked-password protection

## Type
infrastructure

## Priority
low

## Summary
Two Supabase dashboard/platform actions the chairman approved 2026-06-08: (1) upgrade Postgres from supabase-postgres-17.4.1.074 (outstanding security patches available) via Project Settings > Infrastructure, within a coordinated low-activity maintenance window; (2) enable leaked-password protection (HaveIBeenPwned) under Authentication > Policies — relevant because the EHG app has a login surface. Neither is a code change; the SD coordinates the window + documents the steps + confirms no fleet jobs run during the upgrade.

## Strategic Intent
Keep the shared Supabase platform patched and the auth surface hardened, with the disruptive action (Postgres upgrade = brief downtime) scheduled when it will not interrupt in-flight fleet work.

## Business Value
Applies outstanding Postgres security patches and a free credential-protection control with minimal disruption, by picking a fleet-idle window rather than a blind upgrade mid-build.

## Success Criteria
- Postgres upgraded to the current patched version; verified post-upgrade that the fleet (service-role) and the app reconnect cleanly.
- Leaked-password protection enabled in the Auth settings.
- The upgrade window is chosen when no fleet handoff/build is mid-flight (coordinate with the coordinator; confirm no active worker mid-LEAD-FINAL/migration).

## Scope
- Coordinate + confirm a low-activity maintenance window with the coordinator (no in-flight LEAD-FINAL/migration/critical handoff).
- Document the exact dashboard steps for both actions; the chairman executes the dashboard actions (the worker cannot click the dashboard) and the SD verifies the post-upgrade health.
- Post-upgrade canary: confirm a worker can run a stage + a service-role write succeeds.

## Notes
- Chairman-approved 2026-06-08 (both actions). Source: Adam Supabase-linter security triage (wf_8e9e43e7). Low priority (preventative, not an active vulnerability).
