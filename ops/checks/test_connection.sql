-- Test connection SQL
SELECT
    version() as postgres_version,
    current_database() as database,
    current_user as user,
    now() as connection_time;