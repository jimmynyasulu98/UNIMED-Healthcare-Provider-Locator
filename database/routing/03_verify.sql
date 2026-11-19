BEGIN TRANSACTION READ ONLY;

DO $verification$
DECLARE
  table_row_count BIGINT;
  mismatch_details TEXT;
  unima_origin geometry(Point, 4326);
  selected_route geometry;
BEGIN
  IF current_database() <> 'unimed_provider_locator_routing_test' THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Routing verification refused database %L.', current_database()),
      HINT = 'Connect to unimed_provider_locator_routing_test.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'postgis'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pgrouting'
  ) THEN
    RAISE EXCEPTION 'Verification failed: PostGIS and pgRouting must both be enabled.';
  END IF;

  IF to_regprocedure(
    'routing.route_costs(geometry,bigint[],double precision)'
  ) IS NULL OR to_regprocedure(
    'routing.route_geometry(geometry,bigint,double precision)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Verification failed: application-facing routing functions are missing.';
  END IF;

  SELECT COUNT(*) INTO table_row_count FROM routing.road_edges;
  IF table_row_count = 0 THEN
    RAISE EXCEPTION 'Verification failed: routing.road_edges is empty.';
  END IF;

  SELECT string_agg(edge.id::text, ', ' ORDER BY edge.id)
  INTO mismatch_details
  FROM routing.road_edges AS edge
  WHERE edge.source = edge.target
     OR edge.length_m <= 0
     OR (edge.cost < 0 AND edge.reverse_cost < 0)
     OR (edge.cost >= 0 AND abs(edge.cost - edge.length_m) > 1e-6)
     OR (
       edge.reverse_cost >= 0
       AND abs(edge.reverse_cost - edge.length_m) > 1e-6
     )
     OR ST_SRID(edge.geom) <> 4326
     OR ST_GeometryType(edge.geom) <> 'ST_LineString';

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: invalid metre costs/topology on edges %.', mismatch_details;
  END IF;

  SELECT string_agg(
    format(
      '%s (%s m)',
      provider.name,
      round(nearest.snap_distance_m::numeric, 1)
    ),
    ', '
    ORDER BY provider.id
  )
  INTO mismatch_details
  FROM public.providers AS provider
  CROSS JOIN LATERAL routing._nearest_road(
    provider.location::geometry(Point, 4326)
  ) AS nearest
  WHERE provider.is_active = TRUE
    AND provider.location IS NOT NULL
    AND nearest.snap_distance_m > 500;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Verification failed: providers farther than the documented 500 m snap limit: %s.',
        mismatch_details
      ),
      HINT = 'Do not increase the cap or invent coordinates. Inspect the OSM extract and provider point instead.';
  END IF;

  SELECT string_agg(provider.name, ', ' ORDER BY provider.name)
  INTO mismatch_details
  FROM public.providers AS provider
  LEFT JOIN LATERAL routing._nearest_road(
    provider.location::geometry(Point, 4326)
  ) AS nearest ON TRUE
  WHERE provider.is_active = TRUE
    AND provider.location IS NOT NULL
    AND nearest.edge_id IS NULL;

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION 'Verification failed: providers could not snap to any road: %.', mismatch_details;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.providers AS provider
    CROSS JOIN LATERAL routing._nearest_road(
      provider.location::geometry(Point, 4326)
    ) AS nearest
    WHERE provider.name = 'St Luke'
      AND nearest.snap_distance_m <= 500
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.providers AS provider
    CROSS JOIN LATERAL routing._nearest_road(
      provider.location::geometry(Point, 4326)
    ) AS nearest
    WHERE provider.name = 'Pirimiti Mission Hospital'
      AND nearest.snap_distance_m <= 500
  ) THEN
    RAISE EXCEPTION 'Verification failed: road coverage must explicitly include St Luke and Pirimiti Mission Hospital within 500 m.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.providers AS provider
    WHERE provider.name = 'Zomba City Clinic'
      AND abs(ST_X(provider.location::geometry) - 35.32307989318453) <= 1e-12
      AND abs(ST_Y(provider.location::geometry) - (-15.391769141755343)) <= 1e-12
      AND provider.data_source = 'https://maps.app.goo.gl/LbKCZGmETdZsKUQk7'
  ) THEN
    RAISE EXCEPTION 'Verification failed: the corrected Zomba City Clinic record is not present.';
  END IF;

  SELECT provider.location::geometry(Point, 4326)
  INTO unima_origin
  FROM public.providers AS provider
  WHERE provider.name = 'UNIMA Clinic';

  WITH expected AS (
    SELECT array_agg(provider.id ORDER BY provider.id) AS provider_ids
    FROM public.providers AS provider
    WHERE provider.is_active = TRUE
      AND provider.location IS NOT NULL
  ),
  actual AS (
    SELECT route.provider_id, route.route_status
    FROM expected
    CROSS JOIN LATERAL routing.route_costs(
      unima_origin,
      expected.provider_ids,
      500
    ) AS route
  )
  SELECT string_agg(
    format('%s (%s)', provider.name, actual.route_status),
    ', '
    ORDER BY provider.id
  )
  INTO mismatch_details
  FROM actual
  JOIN public.providers AS provider
    ON provider.id = actual.provider_id
  WHERE actual.route_status <> 'reachable';

  IF mismatch_details IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Verification failed: providers not reachable from UNIMA Clinic: %s.',
        mismatch_details
      ),
      HINT = 'Check extract completeness, car access/one-way tags, and real OSM connectivity.';
  END IF;

  SELECT route.geom
  INTO selected_route
  FROM public.providers AS provider
  CROSS JOIN LATERAL routing.route_geometry(
    unima_origin,
    provider.id,
    500
  ) AS route
  WHERE provider.name = 'Zomba Central'
    AND route.route_status = 'reachable';

  IF selected_route IS NULL
     OR ST_IsEmpty(selected_route)
     OR ST_GeometryType(selected_route) <> 'ST_LineString' THEN
    RAISE EXCEPTION 'Verification failed: UNIMA Clinic to Zomba Central did not return route geometry.';
  END IF;

  RAISE NOTICE
    'Routing verification passed: % metre-cost edges; all 11 providers (including St Luke and Pirimiti) snap within 500 m and are reachable from UNIMA Clinic.',
    table_row_count;
END
$verification$ LANGUAGE plpgsql;

COMMIT;
