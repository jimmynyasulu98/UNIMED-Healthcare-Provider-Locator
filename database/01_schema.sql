BEGIN;

DO $schema_guard$
BEGIN
  IF to_regclass('public.providers') IS NOT NULL
     OR to_regclass('public.services') IS NOT NULL
     OR to_regclass('public.provider_service') IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Database setup requires a fresh database.',
      HINT = 'Use a separate empty database; this script will not replace existing tables.';
  END IF;
END
$schema_guard$ LANGUAGE plpgsql;

-- The PostGIS server package must already be installed. This enables it only
-- in the database to which this script is connected.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE public.providers (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(30),
  district VARCHAR(100) NOT NULL DEFAULT 'Zomba',
  address TEXT,
  phone VARCHAR(50),
  location geography(Point, 4326),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  data_source TEXT,
  verified_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT providers_pkey PRIMARY KEY (id),
  CONSTRAINT providers_name_key UNIQUE (name),
  CONSTRAINT providers_category_check CHECK (
    category IN ('Government', 'Private', 'University', 'CHAM', 'Other')
  )
);

CREATE TABLE public.services (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(100) NOT NULL,
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_name_key UNIQUE (name)
);

CREATE TABLE public.provider_service (
  provider_id BIGINT NOT NULL,
  service_id BIGINT NOT NULL,
  CONSTRAINT provider_service_pkey PRIMARY KEY (provider_id, service_id),
  CONSTRAINT provider_service_provider_id_fkey
    FOREIGN KEY (provider_id)
    REFERENCES public.providers(id)
    ON DELETE CASCADE,
  CONSTRAINT provider_service_service_id_fkey
    FOREIGN KEY (service_id)
    REFERENCES public.services(id)
    ON DELETE CASCADE
);

CREATE INDEX providers_location_gix
  ON public.providers
  USING GIST (location);

CREATE INDEX provider_service_service_id_idx
  ON public.provider_service (service_id);

COMMIT;
