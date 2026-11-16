Standalone tests for the ad-media upload (phase 7) and AI ad image (phase 8) functions. They run on a scratch PostgreSQL
database (NOT your Supabase project): load the *_stub.sql file, then the migration, then the *_test.sql file.
A passing run ends with an "ALL ... TESTS PASSED" message (it is raised as an error on purpose so nothing is kept).
Run the *_stub.sql files on separate scratch databases: the two stubs define overlapping tables.
