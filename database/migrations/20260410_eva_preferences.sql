-- Migration: eva_preferences
-- Purpose: Store accumulated mood/preference patterns from Friday meetings
-- Date: 2026-04-10
-- SD: SD-FRIDAY-MANAGEMENT-REVIEW-MEETING-ORCH-001

CREATE TABLE IF NOT EXISTS eva_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_type TEXT NOT NULL CHECK (preference_type IN ('mood_pattern', 'time_preference', 'topic_priority', 'section_skip', 'agenda_override', 'feedback')),
  pattern_data JSONB NOT NULL,
  observation_count INT DEFAULT 1,
  last_observed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE eva_preferences IS 'Accumulated mood/preference patterns from Friday management review meetings';
COMMENT ON COLUMN eva_preferences.preference_type IS 'Category of preference: mood_pattern, time_preference, topic_priority, section_skip, agenda_override, feedback';
COMMENT ON COLUMN eva_preferences.pattern_data IS 'JSONB payload containing the preference details - structure varies by preference_type';
COMMENT ON COLUMN eva_preferences.observation_count IS 'Number of times this pattern has been observed';

CREATE INDEX IF NOT EXISTS idx_eva_preferences_type ON eva_preferences(preference_type);

ALTER TABLE eva_preferences ENABLE ROW LEVEL SECURITY;

-- Rollback:
-- DROP TABLE IF EXISTS eva_preferences;
