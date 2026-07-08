There are TWO MarketLens venture rows in `ventures`. Only one is canonical — do not resolve MarketLens by an unordered name lookup.

- **Canonical / active**: `ecbba50e-3c98-4493-9e77-1719cf6b6f00` — status=active, 68 artifacts, 46 post_build_verdicts, real repo at `C:/Users/rickf/Projects/_EHG/marketlens` (matches `applications.local_path`).
- **Cancelled duplicate**: `4e710bb2-d521-4154-85f4-37300761b090` — status=cancelled, 46 artifacts, 0 post_build_verdicts, no repo.

Root cause of the confusion this section prevents: an unordered `ventures.ilike('name','%marketlens%').limit(1)` returns the CANCELLED row first (it looks real — it has a plausible-but-stale artifact corpus).

**Rule**: for ANY MarketLens artifact/corpus/verdict query, hard-pin `venture_id = ecbba50e-3c98-4493-9e77-1719cf6b6f00`. When resolving any venture by name generally, filter `status='active'` (or order by `updated_at desc` and check status) rather than trusting an unordered first match.
