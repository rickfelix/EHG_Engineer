SELECT id, email,
           raw_user_meta_data->>'role' AS meta_role,
           raw_app_meta_data->>'role' AS app_role,
           created_at
    FROM auth.users
    WHERE email = 'rickfelix2000@gmail.com'
    LIMIT 5;
