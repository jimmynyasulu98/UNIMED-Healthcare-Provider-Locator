BEGIN;

DO $database_guard$
BEGIN
  IF current_database() <> 'unimed_provider_locator_routing_test' THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Routing function setup refused database %L.', current_database()),
      HINT = 'Connect to unimed_provider_locator_routing_test.';
  END IF;

  IF to_regclass('routing.road_edges') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'routing.road_edges is missing.',
      HINT = 'Run 01_finalize_network.sql first.';
  END IF;
END
$database_guard$ LANGUAGE plpgsql;

CREATE FUNCTION routing._nearest_road(input_point geometry(Point, 4326))
RETURNS TABLE (
  edge_id BIGINT,
  source BIGINT,
  target BIGINT,
  cost DOUBLE PRECISION,
  reverse_cost DOUBLE PRECISION,
  edge_geom geometry(LineString, 4326),
  fraction DOUBLE PRECISION,
  snapped_point geometry(Point, 4326),
  snap_distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
STRICT
AS $function$
  SELECT
    edge.id,
    edge.source,
    edge.target,
    edge.cost,
    edge.reverse_cost,
    edge.geom AS edge_geom,
    ST_LineLocatePoint(edge.geom, input_point) AS fraction,
    ST_ClosestPoint(edge.geom, input_point)::geometry(Point, 4326) AS snapped_point,
    ST_Distance(
      input_point::geography,
      ST_ClosestPoint(edge.geom, input_point)::geography
    ) AS snap_distance_m
  FROM routing.road_edges AS edge
  ORDER BY edge.geog <-> input_point::geography, edge.id
  LIMIT 1;
$function$;

COMMENT ON FUNCTION routing._nearest_road(geometry) IS
  'Returns the nearest eligible car segment, the point fraction, and the straight snap distance. The public functions enforce the 500 m default cap.';

CREATE FUNCTION routing._route_plan(
  origin geometry(Point, 4326),
  destination geometry(Point, 4326),
  max_snap_m DOUBLE PRECISION DEFAULT 500
)
RETURNS TABLE (
  route_status TEXT,
  road_distance_m DOUBLE PRECISION,
  origin_snap_distance_m DOUBLE PRECISION,
  provider_snap_distance_m DOUBLE PRECISION,
  origin_edge_id BIGINT,
  origin_fraction DOUBLE PRECISION,
  origin_snap_geom geometry(Point, 4326),
  provider_edge_id BIGINT,
  provider_fraction DOUBLE PRECISION,
  provider_snap_geom geometry(Point, 4326),
  start_vertex BIGINT,
  end_vertex BIGINT,
  origin_partial_direction SMALLINT,
  provider_partial_direction SMALLINT,
  direct_direction SMALLINT
)
LANGUAGE plpgsql
STABLE
STRICT
AS $function$
DECLARE
  origin_road RECORD;
  provider_road RECORD;
  endpoint_option RECORD;
  network_distance DOUBLE PRECISION;
  candidate_distance DOUBLE PRECISION;
  best_distance DOUBLE PRECISION := 'Infinity'::double precision;
  chosen_start BIGINT;
  chosen_end BIGINT;
  chosen_origin_direction SMALLINT;
  chosen_provider_direction SMALLINT;
  chosen_direct_direction SMALLINT;
BEGIN
  IF max_snap_m::text IN ('NaN', 'Infinity', '-Infinity')
     OR max_snap_m <= 0
     OR max_snap_m > 500 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'max_snap_m must be a finite value greater than 0 and no more than 500 metres.';
  END IF;

  IF ST_IsEmpty(origin)
     OR ST_IsEmpty(destination)
     OR ST_SRID(origin) <> 4326
     OR ST_SRID(destination) <> 4326
     OR ST_GeometryType(origin) <> 'ST_Point'
     OR ST_GeometryType(destination) <> 'ST_Point' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Origin and destination must be non-empty EPSG:4326 points.';
  END IF;

  SELECT *
  INTO origin_road
  FROM routing._nearest_road(origin);

  SELECT *
  INTO provider_road
  FROM routing._nearest_road(destination);

  route_status := 'snap-too-far';
  road_distance_m := NULL;

  IF origin_road.edge_id IS NULL OR provider_road.edge_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  origin_snap_distance_m := origin_road.snap_distance_m;
  provider_snap_distance_m := provider_road.snap_distance_m;
  origin_edge_id := origin_road.edge_id;
  origin_fraction := origin_road.fraction;
  origin_snap_geom := origin_road.snapped_point;
  provider_edge_id := provider_road.edge_id;
  provider_fraction := provider_road.fraction;
  provider_snap_geom := provider_road.snapped_point;

  IF origin_snap_distance_m > max_snap_m
     OR provider_snap_distance_m > max_snap_m THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- A direct same-segment candidate is essential: routing only between the
  -- segment endpoints would over-count this common case.
  IF origin_road.edge_id = provider_road.edge_id THEN
    IF provider_road.fraction >= origin_road.fraction
       AND origin_road.cost >= 0 THEN
      best_distance := ST_Length(
        ST_LineSubstring(
          origin_road.edge_geom,
          origin_road.fraction,
          provider_road.fraction
        )::geography
      );
      chosen_direct_direction := 1;
    END IF;

    IF origin_road.fraction >= provider_road.fraction
       AND origin_road.reverse_cost >= 0
       AND (
         ST_Length(
           ST_LineSubstring(
             origin_road.edge_geom,
             provider_road.fraction,
             origin_road.fraction
           )::geography
         ) < best_distance
       ) THEN
      best_distance := ST_Length(
        ST_LineSubstring(
          origin_road.edge_geom,
          provider_road.fraction,
          origin_road.fraction
        )::geography
      );
      chosen_direct_direction := -1;
    END IF;
  END IF;

  -- Treat each snapped point as being connected to the permitted endpoints of
  -- its segment. This uses stable pgRouting Dijkstra functions and therefore
  -- does not depend on the pgr_withPoints family affected by the pgRouting
  -- 4.0.1 Windows issue.
  FOR endpoint_option IN
    SELECT
      origin_endpoint.vertex_id AS start_vid,
      provider_endpoint.vertex_id AS end_vid,
      origin_endpoint.partial_cost + provider_endpoint.partial_cost
        AS partial_cost,
      origin_endpoint.direction AS origin_direction,
      provider_endpoint.direction AS provider_direction
    FROM (
      VALUES
        (
          origin_road.source,
          CASE
            WHEN origin_road.fraction <= 1e-12 THEN 0
            ELSE ST_Length(
              ST_LineSubstring(
                origin_road.edge_geom,
                0,
                origin_road.fraction
              )::geography
            )
          END,
          (-1)::smallint,
          origin_road.fraction <= 1e-12 OR origin_road.reverse_cost >= 0
        ),
        (
          origin_road.target,
          CASE
            WHEN 1 - origin_road.fraction <= 1e-12 THEN 0
            ELSE ST_Length(
              ST_LineSubstring(
                origin_road.edge_geom,
                origin_road.fraction,
                1
              )::geography
            )
          END,
          1::smallint,
          1 - origin_road.fraction <= 1e-12 OR origin_road.cost >= 0
        )
    ) AS origin_endpoint(vertex_id, partial_cost, direction, allowed)
    CROSS JOIN (
      VALUES
        (
          provider_road.source,
          CASE
            WHEN provider_road.fraction <= 1e-12 THEN 0
            ELSE ST_Length(
              ST_LineSubstring(
                provider_road.edge_geom,
                0,
                provider_road.fraction
              )::geography
            )
          END,
          1::smallint,
          provider_road.fraction <= 1e-12 OR provider_road.cost >= 0
        ),
        (
          provider_road.target,
          CASE
            WHEN 1 - provider_road.fraction <= 1e-12 THEN 0
            ELSE ST_Length(
              ST_LineSubstring(
                provider_road.edge_geom,
                provider_road.fraction,
                1
              )::geography
            )
          END,
          (-1)::smallint,
          1 - provider_road.fraction <= 1e-12
            OR provider_road.reverse_cost >= 0
        )
    ) AS provider_endpoint(vertex_id, partial_cost, direction, allowed)
    WHERE origin_endpoint.allowed
      AND provider_endpoint.allowed
    ORDER BY
      origin_endpoint.vertex_id,
      provider_endpoint.vertex_id,
      origin_endpoint.direction,
      provider_endpoint.direction
  LOOP
    network_distance := NULL;

    IF endpoint_option.start_vid = endpoint_option.end_vid THEN
      network_distance := 0;
    ELSE
      SELECT route.agg_cost
      INTO network_distance
      FROM pgr_dijkstraCost(
        'SELECT id, source, target, cost, reverse_cost FROM routing.road_edges',
        endpoint_option.start_vid,
        endpoint_option.end_vid,
        TRUE
      ) AS route
      WHERE route.agg_cost <> 'Infinity'::double precision
      LIMIT 1;
    END IF;

    IF network_distance IS NOT NULL THEN
      candidate_distance := endpoint_option.partial_cost + network_distance;

      -- Strict comparison deliberately retains the deterministic first plan
      -- on ties and retains a direct same-edge plan over an endpoint detour.
      IF candidate_distance < best_distance THEN
        best_distance := candidate_distance;
        chosen_start := endpoint_option.start_vid;
        chosen_end := endpoint_option.end_vid;
        chosen_origin_direction := endpoint_option.origin_direction;
        chosen_provider_direction := endpoint_option.provider_direction;
        chosen_direct_direction := NULL;
      END IF;
    END IF;
  END LOOP;

  IF best_distance = 'Infinity'::double precision THEN
    route_status := 'unreachable';
    RETURN NEXT;
    RETURN;
  END IF;

  route_status := 'reachable';
  road_distance_m := best_distance;
  start_vertex := chosen_start;
  end_vertex := chosen_end;
  origin_partial_direction := chosen_origin_direction;
  provider_partial_direction := chosen_provider_direction;
  direct_direction := chosen_direct_direction;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION routing.route_costs(
  origin geometry(Point, 4326),
  destination_provider_ids BIGINT[],
  max_snap_m DOUBLE PRECISION DEFAULT 500
)
RETURNS TABLE (
  provider_id BIGINT,
  route_status TEXT,
  road_distance_m DOUBLE PRECISION,
  origin_snap_distance_m DOUBLE PRECISION,
  provider_snap_distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
STRICT
AS $function$
  WITH requested_ids AS (
    SELECT DISTINCT requested.provider_id
    FROM unnest(destination_provider_ids) AS requested(provider_id)
  ),
  destinations AS (
    SELECT
      provider.id,
      provider.location::geometry(Point, 4326) AS point
    FROM requested_ids
    JOIN public.providers AS provider
      ON provider.id = requested_ids.provider_id
    WHERE provider.is_active = TRUE
      AND provider.location IS NOT NULL
  )
  SELECT
    destination.id AS provider_id,
    plan.route_status,
    plan.road_distance_m,
    plan.origin_snap_distance_m,
    plan.provider_snap_distance_m
  FROM destinations AS destination
  CROSS JOIN LATERAL routing._route_plan(
    origin,
    destination.point,
    max_snap_m
  ) AS plan
  ORDER BY
    CASE plan.route_status
      WHEN 'reachable' THEN 0
      WHEN 'snap-too-far' THEN 1
      ELSE 2
    END,
    plan.road_distance_m NULLS LAST,
    destination.id;
$function$;

COMMENT ON FUNCTION routing.route_costs(geometry, bigint[], double precision) IS
  'Returns network-only shortest road distance for active requested providers. Straight snap distances are returned separately and are excluded from road_distance_m.';

CREATE FUNCTION routing.route_geometry(
  origin geometry(Point, 4326),
  requested_provider_id BIGINT,
  max_snap_m DOUBLE PRECISION DEFAULT 500
)
RETURNS TABLE (
  provider_id BIGINT,
  route_status TEXT,
  road_distance_m DOUBLE PRECISION,
  origin_snap_distance_m DOUBLE PRECISION,
  provider_snap_distance_m DOUBLE PRECISION,
  geom geometry(LineString, 4326)
)
LANGUAGE plpgsql
STABLE
STRICT
AS $function$
DECLARE
  destination_point geometry(Point, 4326);
  plan RECORD;
BEGIN
  SELECT provider.location::geometry(Point, 4326)
  INTO destination_point
  FROM public.providers AS provider
  WHERE provider.id = requested_provider_id
    AND provider.is_active = TRUE
    AND provider.location IS NOT NULL;

  IF destination_point IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO plan
  FROM routing._route_plan(origin, destination_point, max_snap_m);

  provider_id := requested_provider_id;
  route_status := plan.route_status;
  road_distance_m := plan.road_distance_m;
  origin_snap_distance_m := plan.origin_snap_distance_m;
  provider_snap_distance_m := plan.provider_snap_distance_m;
  geom := NULL;

  IF plan.route_status <> 'reachable' THEN
    RETURN NEXT;
    RETURN;
  END IF;

  IF plan.direct_direction IS NOT NULL THEN
    IF abs(plan.origin_fraction - plan.provider_fraction) < 1e-12 THEN
      geom := ST_MakeLine(
        plan.origin_snap_geom,
        plan.provider_snap_geom
      )::geometry(LineString, 4326);
    ELSIF plan.direct_direction = 1 THEN
      SELECT ST_LineSubstring(
        edge.geom,
        plan.origin_fraction,
        plan.provider_fraction
      )::geometry(LineString, 4326)
      INTO geom
      FROM routing.road_edges AS edge
      WHERE edge.id = plan.origin_edge_id;
    ELSE
      SELECT ST_Reverse(
        ST_LineSubstring(
          edge.geom,
          plan.provider_fraction,
          plan.origin_fraction
        )
      )::geometry(LineString, 4326)
      INTO geom
      FROM routing.road_edges AS edge
      WHERE edge.id = plan.origin_edge_id;
    END IF;

    RETURN NEXT;
    RETURN;
  END IF;

  WITH network_steps AS (
    SELECT
      route.path_seq,
      CASE
        WHEN route.node = edge.source THEN edge.geom
        ELSE ST_Reverse(edge.geom)
      END AS part_geom
    FROM pgr_dijkstra(
      'SELECT id, source, target, cost, reverse_cost FROM routing.road_edges',
      plan.start_vertex,
      plan.end_vertex,
      TRUE
    ) AS route
    JOIN routing.road_edges AS edge
      ON edge.id = route.edge
    WHERE route.edge <> -1
  ),
  ordered_parts AS (
    SELECT 0::bigint AS part_order, plan.origin_snap_geom::geometry AS part_geom

    UNION ALL

    SELECT
      1,
      CASE plan.origin_partial_direction
        WHEN -1 THEN ST_Reverse(
          ST_LineSubstring(edge.geom, 0, plan.origin_fraction)
        )
        ELSE ST_LineSubstring(edge.geom, plan.origin_fraction, 1)
      END
    FROM routing.road_edges AS edge
    WHERE edge.id = plan.origin_edge_id

    UNION ALL

    SELECT 100 + network_steps.path_seq, network_steps.part_geom
    FROM network_steps

    UNION ALL

    SELECT
      1000000,
      CASE plan.provider_partial_direction
        WHEN -1 THEN ST_Reverse(
          ST_LineSubstring(edge.geom, plan.provider_fraction, 1)
        )
        ELSE ST_LineSubstring(edge.geom, 0, plan.provider_fraction)
      END
    FROM routing.road_edges AS edge
    WHERE edge.id = plan.provider_edge_id

    UNION ALL

    SELECT 1000001, plan.provider_snap_geom::geometry
  )
  SELECT ST_Force2D(
    ST_MakeLine(ordered_parts.part_geom ORDER BY ordered_parts.part_order)
  )::geometry(LineString, 4326)
  INTO geom
  FROM ordered_parts
  WHERE ordered_parts.part_geom IS NOT NULL
    AND NOT ST_IsEmpty(ordered_parts.part_geom);

  RETURN NEXT;
END
$function$;

COMMENT ON FUNCTION routing.route_geometry(geometry, bigint, double precision) IS
  'Returns the selected provider route from snapped road point to snapped road point. The LineString excludes straight off-road snap connectors.';

COMMIT;
