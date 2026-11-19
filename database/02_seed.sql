BEGIN;

-- This is the supplied academic catalogue snapshot. It is not a guarantee
-- that provider details or service availability are current.
INSERT INTO public.services (id, name)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'General OPD'),
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
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.providers (
  id,
  name,
  category,
  district,
  address,
  phone,
  location,
  is_active,
  data_source,
  verified_on,
  created_at,
  updated_at
)
OVERRIDING SYSTEM VALUE
VALUES
  (
    1,
    'Malmed',
    'Private',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.322093933683, -15.383457318605885), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/7CcuDbSVgDvKm3Up6',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    2,
    'Zomba Central',
    'Government',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.31400676595647, -15.399341829621479), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/pwfWFcxzGz2xkqM56',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    3,
    'Hope Med Clinic',
    'Private',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.35994446436877, -15.379403134991001), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/fS73vYEgCBGos6vU9',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    4,
    'Zomba City Clinic',
    'Private',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.32307989318453, -15.391769141755343), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/LbKCZGmETdZsKUQk7',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T10:27:57.327163Z'::timestamptz
  ),
  (
    5,
    'Bico Optical',
    'Private',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.321100966222026, -15.388990216215568), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/Xr6syUhXDdEtvUxW6',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    6,
    'MASM',
    'Private',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.33160207971347, -15.378124822961675), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/tRsXkzbjsKP3VLeh9',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    7,
    'St Luke',
    'CHAM',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.35283560854577, -15.208248129662438), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/Dq5coApygPDH55Dk6',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    8,
    'Banja Lantsogolo Zomba',
    NULL,
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.320069650878665, -15.388683748249795), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/rBzJNNWLGu9TJPQ7A',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    9,
    'Citipham Zomba',
    NULL,
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.31955356436971, -15.386169942136581), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/mCVbQLqrjWDVBHaF7',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    10,
    'UNIMA Clinic',
    'University',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.332129450877574, -15.385343687941972), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/4r1Z7X195wMev1g68',
    NULL,
    '2026-11-19T02:34:43.868529Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  ),
  (
    11,
    'Pirimiti Mission Hospital',
    'CHAM',
    'Zomba',
    NULL,
    NULL,
    ST_SetSRID(ST_MakePoint(35.45042037971602, -15.48157217321732), 4326)::geography,
    TRUE,
    'https://maps.app.goo.gl/s9gzw842Q5WY966q7',
    NULL,
    '2026-11-19T03:02:16.932361Z'::timestamptz,
    '2026-11-19T03:35:55.221503Z'::timestamptz
  )
ON CONFLICT (name) DO NOTHING;

WITH assignments(provider_name, service_name) AS (
  VALUES
    ('Malmed', 'General OPD'),
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
INSERT INTO public.provider_service (provider_id, service_id)
SELECT p.id, s.id
FROM assignments AS a
LEFT JOIN public.providers AS p
  ON p.name = a.provider_name
LEFT JOIN public.services AS s
  ON s.name = a.service_name
ON CONFLICT (provider_id, service_id) DO NOTHING;

-- Explicit seed IDs must not leave the identity generators behind them.
-- ALTER COLUMN ... RESTART is transactional, unlike setval().
DO $identity_restart$
DECLARE
  next_provider_id BIGINT;
  next_service_id BIGINT;
BEGIN
  SELECT COALESCE(MAX(id), 0) + 1
  INTO next_provider_id
  FROM public.providers;

  SELECT COALESCE(MAX(id), 0) + 1
  INTO next_service_id
  FROM public.services;

  EXECUTE format(
    'ALTER TABLE public.providers ALTER COLUMN id RESTART WITH %s',
    next_provider_id
  );

  EXECUTE format(
    'ALTER TABLE public.services ALTER COLUMN id RESTART WITH %s',
    next_service_id
  );
END
$identity_restart$ LANGUAGE plpgsql;

COMMIT;
