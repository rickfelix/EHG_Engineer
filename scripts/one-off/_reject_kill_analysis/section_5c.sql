SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ventures'
      AND column_name IN ('killed_at','kill_reason','rejected_at','reject_reason','status_reason','cancellation_reason','cancelled_at','rejected_by_user_id','killed_by_user_id');
