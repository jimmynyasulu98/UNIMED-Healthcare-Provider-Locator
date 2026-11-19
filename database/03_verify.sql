BEGIN TRANSACTION READ ONLY;

DO $verification$
DECLARE
  table_row_count BIGINT;
  mismatch_details TEXT;
  index_is_valid BOOLEAN;
  provider_sequence_last BIGINT;
  provider_sequence_called BOOLEAN;
  service_sequence_last BIGINT;
  service_sequence_called BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension
    WHERE extname = 'postgis'
  ) THEN
    RAISE EXCEPTION 'Verification failed: PostGIS is not enabled in this database.';
  END IF;

  SELECT COUNT(*) INTO table_row_count FROM public.providers;
  IF table_row_count <> 11 THEN
    RAISE EXCEPTION
      'Verification failed: expected 11 providers, found %.',
      table_row_count;
  END IF;

  SELECT COUNT(*) INTO table_row_count FROM public.services;
  IF table_row_count <> 12 THEN
    RAISE EXCEPTION
      'Verification failed: expected 12 services, found %.',
      table_row_count;
  END IF;

  SELECT COUNT(*) INTO table_row_count FROM public.provider_service;
  IF table_row_count <> 23 THEN
    RAISE EXCEPTION
      'Verification failed: expected 23 provider-service assignments, found %.',
      table_row_count;
  END IF;

  WITH expected(
    id,
    name,
    category,
    longitude,
    latitude,
    data_source,
    created_at,
    updated_at
  ) AS (
    VALUES
      (
        1::bigint,
        'Malmed'::text,
        'Private'::text,
        35.322093933683::double precision,
        -15.383457318605885::double precision,
        'https://maps.app.goo.gl/7CcuDbSVgDvKm3Up6'::text,
        '2026-11-19T02:34:43.868529Z'::timestamptz,
        '2026-11-19T03:35:55.221503Z'::timestamptz
      ),
      (2, 'Zomba Central', 'Government', 35.31400676595647, -15.399341829621479, 'https://maps.app.goo.gl/pwfWFcxzGz2xkqM56', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (3, 'Hope Med Clinic', 'Private', 35.35994446436877, -15.379403134991001, 'https://maps.app.goo.gl/fS73vYEgCBGos6vU9', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (4, 'Zomba City Clinic', 'Private', 35.32307989318453, -15.391769141755343, 'https://maps.app.goo.gl/LbKCZGmETdZsKUQk7', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T10:27:57.327163Z'::timestamptz),
      (5, 'Bico Optical', 'Private', 35.321100966222026, -15.388990216215568, 'https://maps.app.goo.gl/Xr6syUhXDdEtvUxW6', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (6, 'MASM', 'Private', 35.33160207971347, -15.378124822961675, 'https://maps.app.goo.gl/tRsXkzbjsKP3VLeh9', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (7, 'St Luke', 'CHAM', 35.35283560854577, -15.208248129662438, 'https://maps.app.goo.gl/Dq5coApygPDH55Dk6', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (8, 'Banja Lantsogolo Zomba', NULL, 35.320069650878665, -15.388683748249795, 'https://maps.app.goo.gl/rBzJNNWLGu9TJPQ7A', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (9, 'Citipham Zomba', NULL, 35.31955356436971, -15.386169942136581, 'https://maps.app.goo.gl/mCVbQLqrjWDVBHaF7', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (10, 'UNIMA Clinic', 'University', 35.332129450877574, -15.385343687941972, 'https://maps.app.goo.gl/4r1Z7X195wMev1g68', '2026-11-19T02:34:43.868529Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz),
      (11, 'Pirimiti Mission Hospital', 'CHAM', 35.45042037971602, -15.48157217321732, 'https://maps.app.goo.gl/s9gzw842Q5WY966q7', '2026-11-19T03:02:16.932361Z'::timestamptz, '2026-11-19T03:35:55.221503Z'::timestamptz)
  )
  SELECT string_agg(e.name, ', ' ORDER BY e.name)
  INTO mismatch_details
  FROM expected AS e
  LEFT JOIN public.providers AS p
    ON p.name = e.name
  WHERE p.id IS NULL
     OR p.id <> e.id
     OR p.category IS DISTINCT FROM e.category
     OR p.district <> 'Zomba'
     OR p.address IS NOT NULL
     OR p.phone IS NOT NULL
     OR p.location IS NULL
     OR p.is_active IS DISTINCT FROM TRUE
     OR p.data_source IS DISTINCT FROM e.data_source
     OR p.verified_on IS NOT NULL
     OR p.created_at IS DISTINCT FROM e.created_at
     OR p.updated_at IS DISTINCT FROM e.updated_at
     OR ST_GeometryType(p.location::geometry) <> 'ST_Point'
     OR ST_SRID(p.location::geometry) <> 4326
     OR abs(ST_X(p.location::geometry) - e.longitude) > 1e-12
     OR abs(ST_Y(p.location::geometry) - e.latitude) > 1e-12;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: provider data mismatch for %.',
      mismatch_details;
  END IF;

  WITH expected(id, name) AS (
    VALUES
      (1::bigint, 'General OPD'::text),
      (2, 'Specialised OPD'),
      (3, 'Inpatient services'),
      (4, 'Optics'),
      (5, 'Dental services'),
      (6, 'Obstetrics and gynaecology'),
      (7, 'Surgery'),
      (8, 'Urology'),
      (9, 'Medicine'),
      (10, 'Paediatrics'),
      (11, 'Neurosurgery'),
      (13, 'Pharmacy')
  )
  SELECT string_agg(e.name, ', ' ORDER BY e.name)
  INTO mismatch_details
  FROM expected AS e
  LEFT JOIN public.services AS s
    ON s.id = e.id
   AND s.name = e.name
  WHERE s.id IS NULL;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: service data mismatch for %.',
      mismatch_details;
  END IF;

  SELECT last_value, is_called
  INTO provider_sequence_last, provider_sequence_called
  FROM public.providers_id_seq;

  SELECT last_value, is_called
  INTO service_sequence_last, service_sequence_called
  FROM public.services_id_seq;

  IF provider_sequence_last <> 12
     OR provider_sequence_called
     OR service_sequence_last <> 14
     OR service_sequence_called THEN
    RAISE EXCEPTION
      'Verification failed: identities should generate provider 12 and service 14 next.';
  END IF;

  WITH expected(provider_name, service_name) AS (
    VALUES
      ('Malmed'::text, 'General OPD'::text),
      ('Zomba Central', 'General OPD'),
      ('Zomba Central', 'Specialised OPD'),
      ('Zomba Central', 'Inpatient services'),
      ('Zomba Central', 'Obstetrics and gynaecology'),
      ('Zomba Central', 'Surgery'),
      ('Zomba Central', 'Urology'),
      ('Zomba Central', 'Medicine'),
      ('Zomba Central', 'Paediatrics'),
      ('Zomba Central', 'Neurosurgery'),
      ('Hope Med Clinic', 'General OPD'),
      ('Zomba City Clinic', 'General OPD'),
      ('Zomba City Clinic', 'Dental services'),
      ('Bico Optical', 'Optics'),
      ('MASM', 'General OPD'),
      ('MASM', 'Inpatient services'),
      ('St Luke', 'General OPD'),
      ('St Luke', 'Inpatient services'),
      ('Banja Lantsogolo Zomba', 'General OPD'),
      ('Citipham Zomba', 'Pharmacy'),
      ('UNIMA Clinic', 'General OPD'),
      ('Pirimiti Mission Hospital', 'General OPD'),
      ('Pirimiti Mission Hospital', 'Inpatient services')
  )
  SELECT string_agg(
    format('%s / %s', e.provider_name, e.service_name),
    ', '
    ORDER BY e.provider_name, e.service_name
  )
  INTO mismatch_details
  FROM expected AS e
  LEFT JOIN public.providers AS p
    ON p.name = e.provider_name
  LEFT JOIN public.services AS s
    ON s.name = e.service_name
  LEFT JOIN public.provider_service AS ps
    ON ps.provider_id = p.id
   AND ps.service_id = s.id
  WHERE ps.provider_id IS NULL;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: missing assignments: %.',
      mismatch_details;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = i.indexrelid
    JOIN pg_catalog.pg_class AS table_class
      ON table_class.oid = i.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_class.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE table_namespace.nspname = 'public'
      AND table_class.relname = 'providers'
      AND index_class.relname = 'providers_location_gix'
      AND access_method.amname = 'gist'
      AND i.indisvalid
      AND i.indisready
      AND pg_get_indexdef(i.indexrelid) LIKE '%USING gist (location)%'
  )
  INTO index_is_valid;

  IF NOT index_is_valid THEN
    RAISE EXCEPTION
      'Verification failed: providers_location_gix is missing or invalid.';
  END IF;

  WITH origin AS (
    SELECT ST_SetSRID(
      ST_MakePoint(35.332129450877574, -15.385343687941972),
      4326
    )::geography AS point
  ),
  expected(radius_metres, expected_count) AS (
    VALUES
      (1000.0::double precision, 2::bigint),
      (5000.0, 9),
      (17000.0, 10),
      (20000.0, 11)
  ),
  actual AS (
    SELECT
      e.radius_metres,
      e.expected_count,
      COUNT(p.id) AS actual_count
    FROM expected AS e
    CROSS JOIN origin AS o
    LEFT JOIN public.providers AS p
      ON p.is_active = TRUE
     AND p.location IS NOT NULL
     AND ST_DWithin(p.location, o.point, e.radius_metres)
    GROUP BY e.radius_metres, e.expected_count
  )
  SELECT string_agg(
    format(
      '%s km expected %s but found %s',
      radius_metres / 1000.0,
      expected_count,
      actual_count
    ),
    '; '
    ORDER BY radius_metres
  )
  INTO mismatch_details
  FROM actual
  WHERE actual_count <> expected_count;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: spatial result mismatch: %.',
      mismatch_details;
  END IF;

  RAISE NOTICE
    'Database verification passed: 11 providers, 12 services, 23 assignments; UNIMA radius checks returned 2/9/10/11.';
END
$verification$ LANGUAGE plpgsql;

COMMIT;
