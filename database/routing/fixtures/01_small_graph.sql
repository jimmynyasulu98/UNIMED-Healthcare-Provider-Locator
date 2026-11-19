BEGIN;

DO $database_guard$
BEGIN
  IF current_database() <> 'unimed_provider_locator_routing_test' THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Routing fixture refused database %L.', current_database()),
      HINT = 'Connect to unimed_provider_locator_routing_test.';
  END IF;

  IF to_regprocedure(
    'routing.route_costs(geometry,bigint[],double precision)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Install the routing functions before running the fixture.';
  END IF;
END
$database_guard$ LANGUAGE plpgsql;

-- High fixture-only edge and vertex identifiers, plus far-away 0..3 degree
-- coordinates, isolate this deterministic graph from imported Malawi roads.
-- Everything is rolled back at the end of the file.
WITH fixture_edges(
  id,
  osm_way_id,
  source,
  target,
  oneway,
  forward_allowed,
  reverse_allowed,
  geom
) AS (
  VALUES
    (900000000101::bigint, -101::bigint, 900000001001::bigint, 900000001002::bigint, 'both'::text, TRUE, TRUE, ST_GeomFromText('LINESTRING(0 0, 0.001 0)', 4326)),
    (900000000102, -102, 900000001002, 900000001003, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(0.001 0, 0.002 0)', 4326)),
    (900000000103, -103, 900000001001, 900000001004, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(0 0, 0 0.01)', 4326)),
    (900000000104, -104, 900000001004, 900000001005, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(0 0.01, 0.0002 0.0001)', 4326)),
    (900000000201, -201, 900000002001, 900000002002, 'forward', TRUE, FALSE, ST_GeomFromText('LINESTRING(1 0, 1.001 0)', 4326)),
    (900000000301, -301, 900000003001, 900000003002, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(2 0, 2.001 0)', 4326)),
    (900000000401, -401, 900000004001, 900000004002, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(3 0, 3.001 0)', 4326)),
    (900000000402, -402, 900000004011, 900000004012, 'both', TRUE, TRUE, ST_GeomFromText('LINESTRING(3 0.01, 3.001 0.01)', 4326))
),
measured_edges AS (
  SELECT
    fixture_edges.*,
    ST_Length(fixture_edges.geom::geography) AS length_m
  FROM fixture_edges
)
INSERT INTO routing.road_edges (
  id,
  osm_way_id,
  source,
  target,
  highway,
  effective_forward_access,
  effective_reverse_access,
  effective_oneway,
  length_m,
  cost,
  reverse_cost,
  geom,
  geog
)
SELECT
  id,
  osm_way_id,
  source,
  target,
  'residential',
  NULL,
  NULL,
  oneway,
  length_m,
  CASE WHEN forward_allowed THEN length_m ELSE -1 END,
  CASE WHEN reverse_allowed THEN length_m ELSE -1 END,
  geom,
  geom::geography
FROM measured_edges;

INSERT INTO public.providers (
  id,
  name,
  category,
  district,
  location,
  is_active,
  data_source
)
OVERRIDING SYSTEM VALUE
VALUES
  (900001, 'Fixture geographic nearest', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(0.0002, 0.0001), 4326)::geography, TRUE, 'transactional fixture'),
  (900002, 'Fixture shortest by road', 'Government', 'Fixture', ST_SetSRID(ST_MakePoint(0.002, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900003, 'Fixture tied road distance', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(0.002, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900004, 'Fixture within road limit', 'University', 'Fixture', ST_SetSRID(ST_MakePoint(0.001, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900005, 'Fixture one-way forward', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(1.001, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900006, 'Fixture one-way source', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(1, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900007, 'Fixture same segment', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(2.00075, 0), 4326)::geography, TRUE, 'transactional fixture'),
  (900008, 'Fixture disconnected', 'Private', 'Fixture', ST_SetSRID(ST_MakePoint(3.001, 0), 4326)::geography, TRUE, 'transactional fixture');

INSERT INTO public.provider_service (provider_id, service_id)
VALUES
  (900001, 1),
  (900002, 4),
  (900003, 1),
  (900004, 1),
  (900005, 1),
  (900006, 1),
  (900007, 1),
  (900008, 1);

DO $fixture_checks$
DECLARE
  geographic_nearest_m DOUBLE PRECISION;
  road_nearest_m DOUBLE PRECISION;
  result_status TEXT;
  result_distance DOUBLE PRECISION;
  expected_distance DOUBLE PRECISION;
  expected_partial_distance DOUBLE PRECISION;
  filtered_ids BIGINT[];
  ordered_ids BIGINT[];
  limited_ids BIGINT[];
  route_line geometry;
BEGIN
  SELECT ST_Distance(
    ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
    location
  )
  INTO geographic_nearest_m
  FROM public.providers
  WHERE id = 900001;

  SELECT ST_Distance(
    ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
    location
  )
  INTO road_nearest_m
  FROM public.providers
  WHERE id = 900002;

  IF geographic_nearest_m >= road_nearest_m THEN
    RAISE EXCEPTION 'Fixture setup failed: provider 900001 should be geographically nearer.';
  END IF;

  SELECT route_status, road_distance_m
  INTO result_status, result_distance
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(0, 0), 4326),
    ARRAY[900001::bigint],
    500
  );

  SELECT SUM(edge.length_m)
  INTO expected_distance
  FROM routing.road_edges AS edge
  WHERE edge.id IN (900000000103, 900000000104);

  IF result_status <> 'reachable'
     OR abs(result_distance - expected_distance) > 1e-6 THEN
    RAISE EXCEPTION 'Expected geographic-nearest fixture route to cost % m, got % / %.', expected_distance, result_status, result_distance;
  END IF;

  SELECT route_status, road_distance_m
  INTO result_status, result_distance
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(0, 0), 4326),
    ARRAY[900002::bigint],
    500
  );

  SELECT SUM(edge.length_m)
  INTO expected_distance
  FROM routing.road_edges AS edge
  WHERE edge.id IN (900000000101, 900000000102);

  IF result_status <> 'reachable'
     OR abs(result_distance - expected_distance) > 1e-6 THEN
    RAISE EXCEPTION 'Expected road-nearest fixture route to cost % m, got % / %.', expected_distance, result_status, result_distance;
  END IF;

  SELECT route_status, road_distance_m
  INTO result_status, result_distance
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(1, 0), 4326),
    ARRAY[900005::bigint],
    500
  );

  SELECT edge.length_m
  INTO expected_distance
  FROM routing.road_edges AS edge
  WHERE edge.id = 900000000201;

  IF result_status <> 'reachable'
     OR abs(result_distance - expected_distance) > 1e-6 THEN
    RAISE EXCEPTION 'Expected forward one-way route to cost % m, got % / %.', expected_distance, result_status, result_distance;
  END IF;

  SELECT route_status
  INTO result_status
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(1.001, 0), 4326),
    ARRAY[900006::bigint],
    500
  );

  IF result_status <> 'unreachable' THEN
    RAISE EXCEPTION 'Expected reverse one-way route to be unreachable, got %.', result_status;
  END IF;

  SELECT route_status, road_distance_m
  INTO result_status, result_distance
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(2.00025, 0), 4326),
    ARRAY[900007::bigint],
    500
  );

  SELECT ST_Length(
    ST_LineSubstring(edge.geom, 0.25, 0.75)::geography
  )
  INTO expected_partial_distance
  FROM routing.road_edges AS edge
  WHERE edge.id = 900000000301;

  IF result_status <> 'reachable'
     OR abs(result_distance - expected_partial_distance) > 1e-6 THEN
    RAISE EXCEPTION 'Expected exact same-segment partial length % m, got % / %.', expected_partial_distance, result_status, result_distance;
  END IF;

  SELECT route_status
  INTO result_status
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(3, 0.01), 4326),
    ARRAY[900008::bigint],
    500
  );

  IF result_status <> 'unreachable' THEN
    RAISE EXCEPTION 'Expected disconnected provider to be unreachable, got %.', result_status;
  END IF;

  SELECT array_agg(provider.id ORDER BY provider.id)
  INTO filtered_ids
  FROM public.providers AS provider
  JOIN public.provider_service AS assignment
    ON assignment.provider_id = provider.id
  WHERE provider.id BETWEEN 900001 AND 900008
    AND provider.category = 'Government'
    AND assignment.service_id = 4;

  IF filtered_ids IS DISTINCT FROM ARRAY[900002::bigint] THEN
    RAISE EXCEPTION 'Service/category fixture filtering returned %.', filtered_ids;
  END IF;

  SELECT array_agg(result.provider_id ORDER BY result.ordinality)
  INTO ordered_ids
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(0, 0), 4326),
    ARRAY[900003::bigint, 900002::bigint],
    500
  ) WITH ORDINALITY AS result(
    provider_id,
    route_status,
    road_distance_m,
    origin_snap_distance_m,
    provider_snap_distance_m,
    ordinality
  );

  IF ordered_ids IS DISTINCT FROM ARRAY[900002::bigint, 900003::bigint] THEN
    RAISE EXCEPTION 'Equal road distances were not ordered by provider ID: %.', ordered_ids;
  END IF;

  SELECT array_agg(result.provider_id ORDER BY result.provider_id)
  INTO limited_ids
  FROM routing.route_costs(
    ST_SetSRID(ST_MakePoint(0, 0), 4326),
    ARRAY[900001::bigint, 900002::bigint, 900004::bigint],
    500
  ) AS result
  WHERE result.route_status = 'reachable'
    AND result.road_distance_m <= 150;

  IF limited_ids IS DISTINCT FROM ARRAY[900004::bigint] THEN
    RAISE EXCEPTION 'The caller-side 150 m road limit returned %.', limited_ids;
  END IF;

  SELECT geometry_result.geom
  INTO route_line
  FROM routing.route_geometry(
    ST_SetSRID(ST_MakePoint(2.00025, 0), 4326),
    900007,
    500
  ) AS geometry_result;

  IF route_line IS NULL
     OR ST_IsEmpty(route_line)
     OR ST_GeometryType(route_line) <> 'ST_LineString' THEN
    RAISE EXCEPTION 'Same-segment route geometry was not a non-empty LineString.';
  END IF;

  RAISE NOTICE 'Transactional routing fixture passed: road ordering, one-way, same-segment, no-route, filters, ties, limit, and geometry.';
END
$fixture_checks$ LANGUAGE plpgsql;

ROLLBACK;
