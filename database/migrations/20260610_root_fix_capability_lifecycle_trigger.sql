-- @approved-by:codestreetlabs@gmail.com
-- SD-FDBK-FIX-ROOT-FIX-TRG-001: Root-fix trg_capability_lifecycle null-unsafe
-- capability_type mapping (blocks LEAD-FINAL completion writes).
--
-- PROBLEM (flag 4c504093, recurred 2x in one session — feedback 94e8811a):
--   fn_handle_capability_lifecycle's delivers_capabilities branch inserts
--   cap_record->>'capability_type' BARE into sd_capabilities.capability_type,
--   which is NOT NULL + 19-value CHECK. So a string-shaped entry, an object
--   missing capability_type, or an out-of-list type hard-fails the ENTIRE
--   strategic_directives_v2 completion UPDATE at LEAD-FINAL. The fleet
--   workaround (clearing delivers_capabilities to []) loses ledger data.
--   The modifies/deprecates branches already COALESCE(...,'agent') — the
--   delivers branch is the asymmetric, unsafe one.
--
-- FIX (fail-soft; the capability ledger is best-effort telemetry, the SD
-- completion write is sacred):
--   FR-1 jsonb_typeof array-guards on all three capability fields (a scalar
--        top-level value is skipped with a WARNING, not a thrown error).
--   FR-2 per-record normalization in the delivers branch:
--        - non-object entries -> capability_key = the scalar text,
--          capability_type = 'tool', raw preserved in action_details
--        - object entries -> COALESCE(NULLIF(trim(type),''),'tool'), and
--          types outside the CHECK list fall back to 'tool' (raw entry is
--          already preserved verbatim in action_details)
--   FR-3 outer EXCEPTION guard: ANY residual ledger-mapping error degrades to
--        RAISE WARNING + RETURN NEW — it can never block the completion write.
--
-- The live production function was sourced via pg_get_functiondef on
-- 2026-06-10 (it exists in NO prior repo migration; this file is its first
-- repo definition). The prior body is preserved at the bottom for rollback.
--
-- Apply: atomic CREATE OR REPLACE; no table/constraint/trigger-binding change.

CREATE OR REPLACE FUNCTION public.fn_handle_capability_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    cap_record JSONB;
    norm_type TEXT;
    norm_key TEXT;
    norm_details JSONB;
    -- Mirror of the sd_capabilities_capability_type_check allow-list.
    valid_types CONSTANT TEXT[] := ARRAY[
        'agent','crew','tool','skill','database_schema','database_function',
        'rls_policy','migration','api_endpoint','component','hook','service',
        'utility','workflow','webhook','external_integration','validation_rule',
        'quality_gate','protocol'
    ];
BEGIN
    -- Only trigger on status change to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

        -- ── delivers_capabilities: register new capabilities ────────────────
        -- FR-1: guard the field shape before jsonb_array_length/iteration.
        IF NEW.delivers_capabilities IS NOT NULL
           AND jsonb_typeof(NEW.delivers_capabilities) <> 'array' THEN
            RAISE WARNING 'fn_handle_capability_lifecycle: delivers_capabilities on SD % is % (expected array) — skipped',
                NEW.id, jsonb_typeof(NEW.delivers_capabilities);
        ELSIF NEW.delivers_capabilities IS NOT NULL
              AND jsonb_array_length(NEW.delivers_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.delivers_capabilities)
            LOOP
                -- FR-2: normalize each record so the NOT NULL + CHECK columns
                -- can never reject the completion write.
                IF jsonb_typeof(cap_record) <> 'object' THEN
                    -- String/scalar entry: key = the scalar text, type 'tool',
                    -- raw preserved.
                    norm_key := left(trim(both '"' from cap_record::text), 255);
                    norm_type := 'tool';
                    norm_details := jsonb_build_object('raw', cap_record, 'normalized', true);
                ELSE
                    norm_key := cap_record->>'capability_key';
                    norm_type := COALESCE(NULLIF(trim(cap_record->>'capability_type'), ''), 'tool');
                    IF NOT (norm_type = ANY (valid_types)) THEN
                        norm_type := 'tool';
                    END IF;
                    -- Raw entry preserved verbatim; mark when we changed the type.
                    norm_details := cap_record;
                    IF norm_type IS DISTINCT FROM (cap_record->>'capability_type') THEN
                        norm_details := norm_details || jsonb_build_object('normalized', true);
                    END IF;
                END IF;

                -- Insert into crewai_agents only for explicit, well-formed agents
                IF jsonb_typeof(cap_record) = 'object'
                   AND cap_record->>'capability_type' = 'agent' THEN
                    INSERT INTO crewai_agents (
                        agent_key,
                        name,
                        role,
                        goal,
                        backstory,
                        status,
                        created_at
                    ) VALUES (
                        cap_record->>'capability_key',
                        cap_record->>'name',
                        COALESCE(cap_record->>'role', cap_record->>'name'),
                        COALESCE(cap_record->>'goal', 'Automated agent from SD completion'),
                        COALESCE(cap_record->>'backstory', 'Auto-registered by ' || NEW.id),
                        'active',
                        NOW()
                    )
                    ON CONFLICT (agent_key) DO UPDATE SET
                        name = EXCLUDED.name,
                        status = 'active',
                        updated_at = NOW();
                END IF;

                -- Log to audit trail (normalized — can no longer violate
                -- capability_type NOT NULL or its CHECK)
                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.id,  -- NOT uuid_id: the sd_uuid FK targets strategic_directives_v2(id); uuid_id <> id for 3,686/3,687 SDs (2nd root bug — FK-failed the ledger insert for virtually every real SD)
                    NEW.id,
                    norm_type,
                    norm_key,
                    'registered',
                    norm_details
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- ── modifies_capabilities: update existing capabilities ─────────────
        IF NEW.modifies_capabilities IS NOT NULL
           AND jsonb_typeof(NEW.modifies_capabilities) <> 'array' THEN
            RAISE WARNING 'fn_handle_capability_lifecycle: modifies_capabilities on SD % is % (expected array) — skipped',
                NEW.id, jsonb_typeof(NEW.modifies_capabilities);
        ELSIF NEW.modifies_capabilities IS NOT NULL
              AND jsonb_array_length(NEW.modifies_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.modifies_capabilities)
            LOOP
                IF jsonb_typeof(cap_record) <> 'object' THEN
                    RAISE WARNING 'fn_handle_capability_lifecycle: non-object modifies_capabilities entry on SD % — skipped', NEW.id;
                    CONTINUE;
                END IF;

                UPDATE crewai_agents
                SET
                    name = COALESCE(cap_record->'updates'->>'name', name),
                    role = COALESCE(cap_record->'updates'->>'role', role),
                    goal = COALESCE(cap_record->'updates'->>'goal', goal),
                    status = COALESCE(cap_record->'updates'->>'status', status),
                    updated_at = NOW()
                WHERE agent_key = cap_record->>'capability_key';

                -- Pre-fix code COALESCEd to 'agent' here; keep that default but
                -- validate against the CHECK list too (out-of-list -> 'agent'
                -- would be wrong; fall back to 'tool' like the delivers branch
                -- only when the supplied value is invalid).
                norm_type := COALESCE(NULLIF(trim(cap_record->>'capability_type'), ''), 'agent');
                IF NOT (norm_type = ANY (valid_types)) THEN
                    norm_type := 'tool';
                END IF;

                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.id,  -- NOT uuid_id: the sd_uuid FK targets strategic_directives_v2(id); uuid_id <> id for 3,686/3,687 SDs (2nd root bug — FK-failed the ledger insert for virtually every real SD)
                    NEW.id,
                    norm_type,
                    cap_record->>'capability_key',
                    'updated',
                    cap_record
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;

        -- ── deprecates_capabilities: mark capabilities deprecated ───────────
        IF NEW.deprecates_capabilities IS NOT NULL
           AND jsonb_typeof(NEW.deprecates_capabilities) <> 'array' THEN
            RAISE WARNING 'fn_handle_capability_lifecycle: deprecates_capabilities on SD % is % (expected array) — skipped',
                NEW.id, jsonb_typeof(NEW.deprecates_capabilities);
        ELSIF NEW.deprecates_capabilities IS NOT NULL
              AND jsonb_array_length(NEW.deprecates_capabilities) > 0 THEN
            FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.deprecates_capabilities)
            LOOP
                IF jsonb_typeof(cap_record) <> 'object' THEN
                    RAISE WARNING 'fn_handle_capability_lifecycle: non-object deprecates_capabilities entry on SD % — skipped', NEW.id;
                    CONTINUE;
                END IF;

                UPDATE crewai_agents
                SET
                    status = 'deprecated',
                    updated_at = NOW()
                WHERE agent_key = cap_record->>'capability_key';

                norm_type := COALESCE(NULLIF(trim(cap_record->>'capability_type'), ''), 'agent');
                IF NOT (norm_type = ANY (valid_types)) THEN
                    norm_type := 'tool';
                END IF;

                INSERT INTO sd_capabilities (
                    sd_uuid,
                    sd_id,
                    capability_type,
                    capability_key,
                    action,
                    action_details
                ) VALUES (
                    NEW.id,  -- NOT uuid_id: the sd_uuid FK targets strategic_directives_v2(id); uuid_id <> id for 3,686/3,687 SDs (2nd root bug — FK-failed the ledger insert for virtually every real SD)
                    NEW.id,
                    norm_type,
                    cap_record->>'capability_key',
                    'deprecated',
                    cap_record
                )
                ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
-- FR-3: the capability ledger is best-effort telemetry; the SD completion
-- write is sacred. ANY residual mapping error (future constraint additions,
-- crewai_agents drift, unexpected JSONB shapes) degrades to a logged warning.
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_handle_capability_lifecycle suppressed % for SD % — capability ledger row(s) skipped, completion write preserved',
        SQLERRM, NEW.id;
    RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN / ROLLBACK: the prior PRODUCTION body (pg_get_functiondef, 2026-06-10).
-- To roll back, re-run the function below.
-- NOTE: this prior version is the one that hard-fails completion writes on
-- malformed delivers_capabilities — only restore it if the fail-soft version
-- above causes a regression.
--
-- [DOWN BODY — to restore, reassemble the header without the marker]
-- CREATE OR REPLACE FUNCTION (rollback-target): public.fn_handle_capability_lifecycle()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO 'public', 'extensions'
-- AS $fn$
-- DECLARE
--     cap_record JSONB;
--     new_capability RECORD;
-- BEGIN
--     IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
--         IF NEW.delivers_capabilities IS NOT NULL AND jsonb_array_length(NEW.delivers_capabilities) > 0 THEN
--             FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.delivers_capabilities)
--             LOOP
--                 IF cap_record->>'capability_type' = 'agent' THEN
--                     INSERT INTO crewai_agents (agent_key, name, role, goal, backstory, status, created_at)
--                     VALUES (
--                         cap_record->>'capability_key',
--                         cap_record->>'name',
--                         COALESCE(cap_record->>'role', cap_record->>'name'),
--                         COALESCE(cap_record->>'goal', 'Automated agent from SD completion'),
--                         COALESCE(cap_record->>'backstory', 'Auto-registered by ' || NEW.id),
--                         'active', NOW()
--                     )
--                     ON CONFLICT (agent_key) DO UPDATE SET
--                         name = EXCLUDED.name, status = 'active', updated_at = NOW();
--                 END IF;
--                 INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
--                 VALUES (NEW.uuid_id, NEW.id, cap_record->>'capability_type', cap_record->>'capability_key', 'registered', cap_record)
--                 ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
--             END LOOP;
--         END IF;
--         IF NEW.modifies_capabilities IS NOT NULL AND jsonb_array_length(NEW.modifies_capabilities) > 0 THEN
--             FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.modifies_capabilities)
--             LOOP
--                 UPDATE crewai_agents SET
--                     name = COALESCE(cap_record->'updates'->>'name', name),
--                     role = COALESCE(cap_record->'updates'->>'role', role),
--                     goal = COALESCE(cap_record->'updates'->>'goal', goal),
--                     status = COALESCE(cap_record->'updates'->>'status', status),
--                     updated_at = NOW()
--                 WHERE agent_key = cap_record->>'capability_key';
--                 INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
--                 VALUES (NEW.uuid_id, NEW.id, COALESCE(cap_record->>'capability_type', 'agent'), cap_record->>'capability_key', 'updated', cap_record)
--                 ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
--             END LOOP;
--         END IF;
--         IF NEW.deprecates_capabilities IS NOT NULL AND jsonb_array_length(NEW.deprecates_capabilities) > 0 THEN
--             FOR cap_record IN SELECT * FROM jsonb_array_elements(NEW.deprecates_capabilities)
--             LOOP
--                 UPDATE crewai_agents SET status = 'deprecated', updated_at = NOW()
--                 WHERE agent_key = cap_record->>'capability_key';
--                 INSERT INTO sd_capabilities (sd_uuid, sd_id, capability_type, capability_key, action, action_details)
--                 VALUES (NEW.uuid_id, NEW.id, COALESCE(cap_record->>'capability_type', 'agent'), cap_record->>'capability_key', 'deprecated', cap_record)
--                 ON CONFLICT (sd_uuid, capability_key, action) DO NOTHING;
--             END LOOP;
--         END IF;
--     END IF;
--     RETURN NEW;
-- END;
-- $fn$;
