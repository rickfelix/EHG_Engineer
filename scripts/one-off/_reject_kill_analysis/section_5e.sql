SELECT id, email,
           raw_user_meta_data->>'role' AS meta_role,
           raw_app_meta_data->>'role' AS app_role
    FROM auth.users
    WHERE raw_user_meta_data->>'role' IN ('chairman','lead')
       OR raw_app_meta_data->>'role' IN ('chairman','lead')
    ORDER BY created_at
    LIMIT 10;
