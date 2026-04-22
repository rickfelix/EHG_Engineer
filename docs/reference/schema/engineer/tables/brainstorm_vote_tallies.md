# brainstorm_vote_tallies Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-22T22:11:25.679Z
**Rows**: 0
**RLS**: Enabled (0 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| debate_session_id | `uuid` | **NO** | - | - |
| seat_code | `text` | **NO** | - | - |
| candidate_number | `integer(32)` | **NO** | - | - |
| rank_position | `integer(32)` | **NO** | - | - |
| borda_points | `integer(32)` | **NO** | - | - |
| reason | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `brainstorm_vote_tallies_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `brainstorm_vote_tallies_debate_session_id_fkey`: debate_session_id → debate_sessions(id)

### Unique Constraints
- `brainstorm_vote_tallies_debate_session_id_seat_code_rank_po_key`: UNIQUE (debate_session_id, seat_code, rank_position)

### Check Constraints
- `brainstorm_vote_tallies_borda_points_check`: CHECK (((borda_points >= 1) AND (borda_points <= 3)))
- `brainstorm_vote_tallies_rank_position_check`: CHECK (((rank_position >= 1) AND (rank_position <= 3)))
- `brainstorm_vote_tallies_seat_code_check`: CHECK ((seat_code = ANY (ARRAY['CSO'::text, 'CRO'::text, 'CTO'::text, 'CISO'::text, 'COO'::text, 'CFO'::text])))

## Indexes

- `brainstorm_vote_tallies_debate_session_id_seat_code_rank_po_key`
  ```sql
  CREATE UNIQUE INDEX brainstorm_vote_tallies_debate_session_id_seat_code_rank_po_key ON public.brainstorm_vote_tallies USING btree (debate_session_id, seat_code, rank_position)
  ```
- `brainstorm_vote_tallies_pkey`
  ```sql
  CREATE UNIQUE INDEX brainstorm_vote_tallies_pkey ON public.brainstorm_vote_tallies USING btree (id)
  ```
- `idx_brainstorm_vote_tallies_session`
  ```sql
  CREATE INDEX idx_brainstorm_vote_tallies_session ON public.brainstorm_vote_tallies USING btree (debate_session_id)
  ```

## Triggers

### trg_brainstorm_vote_append_only

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION enforce_brainstorm_vote_append_only()`

### trg_brainstorm_vote_append_only

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_brainstorm_vote_append_only()`

---

[← Back to Schema Overview](../database-schema-overview.md)
