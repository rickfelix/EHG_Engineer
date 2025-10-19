-- Super simple diagnostic
-- This should produce visible output in Supabase

-- Test 1: Can we see RAISE NOTICE output?
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST 1: Can you see this message?';
  RAISE NOTICE 'If yes, RAISE NOTICE works';
  RAISE NOTICE '========================================';
END $$;

-- Test 2: What does calculate_sd_progress currently return?
DO $$
DECLARE
  current_value INTEGER;
BEGIN
  current_value := calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844');
  RAISE NOTICE 'TEST 2: Current progress value: %', current_value;
END $$;

-- Test 3: Check user stories count
DO $$
DECLARE
  story_count INTEGER;
  story_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO story_count
  FROM user_stories
  WHERE sd_id = 'SD-PROOF-DRIVEN-1758340937844';

  SELECT EXISTS (
    SELECT 1 FROM user_stories
    WHERE sd_id = 'SD-PROOF-DRIVEN-1758340937844'
  ) INTO story_exists;

  RAISE NOTICE 'TEST 3: User story count: %', story_count;
  RAISE NOTICE 'TEST 3: User stories exist: %', story_exists;
  RAISE NOTICE 'TEST 3: Expected behavior when count=0: user_stories_validated should be TRUE';
END $$;
