-- Deep Cascade Fix Migration
-- Automatically finds all foreign keys referencing core user data tables
-- and ensures they are set to ON DELETE CASCADE instead of NO ACTION / RESTRICT.

DO $$
DECLARE
    r RECORD;
    target_tables text[] := ARRAY[
        'users', -- auth.users
        'profiles',
        'goals',
        'habit_stacks',
        'commitments',
        'schedule_blocks',
        'coach_threads',
        'schedule_versions',
        'brain_dumps',
        'brain_dump_entries',
        'conversations'
    ];
BEGIN
    FOR r IN (
        SELECT
            tc.table_schema,
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_schema AS foreign_schema,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
        WHERE
            tc.constraint_type = 'FOREIGN KEY'
            -- We want to change NO ACTION or RESTRICT to CASCADE. 
            -- If it's SET NULL, we probably designed it that way, but for user deletion,
            -- CASCADE is safer. Let's just convert any that are NOT cascade.
            AND rc.delete_rule <> 'CASCADE'
            AND rc.delete_rule <> 'SET NULL'
            AND (
                (ccu.table_schema = 'auth' AND ccu.table_name = 'users') 
                OR
                (ccu.table_schema = 'public' AND ccu.table_name = ANY(target_tables))
            )
    ) LOOP
        RAISE NOTICE 'Updating FK % on %.% -> referencing %.%', 
                     r.constraint_name, r.table_schema, r.table_name, r.foreign_schema, r.foreign_table;
                     
        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            r.table_schema, r.table_name, r.constraint_name
        );
        EXECUTE format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE CASCADE',
            r.table_schema, r.table_name, r.constraint_name, r.column_name, r.foreign_schema, r.foreign_table, r.foreign_column
        );
    END LOOP;
END $$;
