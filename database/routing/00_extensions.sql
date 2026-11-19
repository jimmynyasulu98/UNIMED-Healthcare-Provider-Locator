BEGIN;

DO $database_guard$
BEGIN
  IF current_database() <> 'unimed_provider_locator_routing_test' THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Routing setup refused database %L.',
        current_database()
      ),
      HINT = 'Create and connect to the separate unimed_provider_locator_routing_test database. Never run routing setup against the normal application database.';
  END IF;

  IF to_regclass('public.providers') IS NULL
     OR to_regclass('public.services') IS NULL
     OR to_regclass('public.provider_service') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'The reproducible provider catalogue is missing.',
      HINT = 'Run database/01_schema.sql, database/02_seed.sql, and database/03_verify.sql in this routing test database first.';
  END IF;
END
$database_guard$ LANGUAGE plpgsql;

-- These extensions must be installed on the PostgreSQL server already. This
-- script enables them only in the isolated routing test database.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE EXTENSION IF NOT EXISTS hstore;

CREATE SCHEMA IF NOT EXISTS routing_import;
CREATE SCHEMA IF NOT EXISTS routing;

COMMENT ON SCHEMA routing_import IS
  'Disposable osm2pgrouting 3.x import tables for the isolated routing test database.';

COMMENT ON SCHEMA routing IS
  'Stable, read-only application-facing road graph and routing functions.';

COMMIT;
