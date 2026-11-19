BEGIN;

DO $database_guard$
BEGIN
  IF current_database() <> 'unimed_provider_locator_routing_test' THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Routing finalisation refused database %L.', current_database()),
      HINT = 'Connect to unimed_provider_locator_routing_test.';
  END IF;

  IF to_regclass('routing_import.ways') IS NULL
     OR to_regclass('routing_import.ways_vertices_pgr') IS NULL
     OR to_regclass('routing_import.osm_ways') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'The osm2pgrouting import is missing.',
      HINT = 'Run osm2pgrouting 3.x with --schema routing_import --addnodes --tags before this script.';
  END IF;

  IF to_regclass('routing.road_edges') IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'routing.road_edges already exists; refusing to replace it.',
      HINT = 'Use a newly created unimed_provider_locator_routing_test database for a reproducible rebuild.';
  END IF;
END
$database_guard$ LANGUAGE plpgsql;

CREATE TABLE routing.road_edges (
  id BIGINT PRIMARY KEY,
  osm_way_id BIGINT NOT NULL,
  source BIGINT NOT NULL,
  target BIGINT NOT NULL,
  highway TEXT NOT NULL,
  effective_forward_access TEXT,
  effective_reverse_access TEXT,
  effective_oneway TEXT NOT NULL,
  length_m DOUBLE PRECISION NOT NULL CHECK (length_m > 0),
  cost DOUBLE PRECISION NOT NULL CHECK (cost = -1 OR cost >= 0),
  reverse_cost DOUBLE PRECISION NOT NULL CHECK (
    reverse_cost = -1 OR reverse_cost >= 0
  ),
  geom geometry(LineString, 4326) NOT NULL,
  geog geography(LineString, 4326) NOT NULL,
  CHECK (source <> target),
  CHECK (cost >= 0 OR reverse_cost >= 0)
);

WITH imported AS (
  SELECT
    w.id,
    w.osm_id,
    w.source,
    w.target,
    w.geom,
    ow.tags,
    NULLIF(lower(btrim(ow.tags -> 'highway')), '') AS highway,
    NULLIF(lower(btrim(ow.tags -> 'area')), '') AS area,
    NULLIF(lower(btrim(ow.tags -> 'junction')), '') AS junction,
    COALESCE(
      NULLIF(lower(btrim(ow.tags -> 'motorcar:forward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motorcar')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motor_vehicle:forward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motor_vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'vehicle:forward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'access:forward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'access')), '')
    ) AS forward_access,
    COALESCE(
      NULLIF(lower(btrim(ow.tags -> 'motorcar:backward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motorcar')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motor_vehicle:backward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'motor_vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'vehicle:backward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'access:backward')), ''),
      NULLIF(lower(btrim(ow.tags -> 'access')), '')
    ) AS reverse_access,
    COALESCE(
      NULLIF(lower(btrim(ow.tags -> 'oneway:motorcar')), ''),
      NULLIF(lower(btrim(ow.tags -> 'oneway:motor_vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'oneway:vehicle')), ''),
      NULLIF(lower(btrim(ow.tags -> 'oneway')), '')
    ) AS oneway
  FROM routing_import.ways AS w
  JOIN routing_import.osm_ways AS ow
    ON ow.osm_id = w.osm_id
  WHERE w.geom IS NOT NULL
    AND ST_GeometryType(w.geom) = 'ST_LineString'
    AND ST_SRID(w.geom) = 4326
    AND w.source IS NOT NULL
    AND w.target IS NOT NULL
    AND w.source <> w.target
),
normalised AS (
  SELECT
    imported.*,
    CASE
      WHEN oneway IN ('yes', 'true', '1') THEN 'forward'
      WHEN oneway IN ('-1', 'reverse') THEN 'reverse'
      WHEN oneway IN ('no', 'false', '0') THEN 'both'
      WHEN oneway IS NULL AND junction IN ('roundabout', 'circular') THEN 'forward'
      WHEN oneway IS NULL AND highway IN ('motorway', 'motorway_link') THEN 'forward'
      WHEN oneway IS NULL THEN 'both'
      ELSE 'blocked'
    END AS oneway_direction,
    CASE
      WHEN forward_access IS NULL THEN TRUE
      WHEN forward_access IN (
        'yes', 'permissive', 'designated', 'destination', 'customers'
      ) THEN TRUE
      ELSE FALSE
    END AS forward_access_allowed,
    CASE
      WHEN reverse_access IS NULL THEN TRUE
      WHEN reverse_access IN (
        'yes', 'permissive', 'designated', 'destination', 'customers'
      ) THEN TRUE
      ELSE FALSE
    END AS reverse_access_allowed,
    ST_Length(geom::geography) AS measured_length_m
  FROM imported
  WHERE highway IN (
    'motorway',
    'motorway_link',
    'trunk',
    'trunk_link',
    'primary',
    'primary_link',
    'secondary',
    'secondary_link',
    'tertiary',
    'tertiary_link',
    'residential',
    'living_street',
    'service',
    'unclassified',
    'road',
    'track'
  )
    AND COALESCE(area, 'no') NOT IN ('yes', 'true', '1')
),
directional AS (
  SELECT
    normalised.*,
    forward_access_allowed
      AND oneway_direction IN ('forward', 'both') AS forward_allowed,
    reverse_access_allowed
      AND oneway_direction IN ('reverse', 'both') AS reverse_allowed
  FROM normalised
  WHERE measured_length_m > 0
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
  osm_id,
  source,
  target,
  highway,
  forward_access,
  reverse_access,
  oneway_direction,
  measured_length_m,
  CASE WHEN forward_allowed THEN measured_length_m ELSE -1 END,
  CASE WHEN reverse_allowed THEN measured_length_m ELSE -1 END,
  geom,
  geom::geography
FROM directional
WHERE forward_allowed OR reverse_allowed;

CREATE INDEX road_edges_source_idx ON routing.road_edges (source);
CREATE INDEX road_edges_target_idx ON routing.road_edges (target);
CREATE INDEX road_edges_geom_gix ON routing.road_edges USING GIST (geom);
CREATE INDEX road_edges_geog_gix ON routing.road_edges USING GIST (geog);

ANALYZE routing.road_edges;

DO $network_guard$
DECLARE
  edge_count BIGINT;
  orientation_mismatch_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO edge_count FROM routing.road_edges;

  IF edge_count = 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = 'No eligible motor-car road edges survived finalisation.',
      HINT = 'Check the extract, the car map configuration, and retained OSM tags.';
  END IF;

  SELECT COUNT(*)
  INTO orientation_mismatch_count
  FROM routing.road_edges AS edge
  LEFT JOIN routing_import.ways_vertices_pgr AS source_vertex
    ON source_vertex.id = edge.source
  LEFT JOIN routing_import.ways_vertices_pgr AS target_vertex
    ON target_vertex.id = edge.target
  WHERE source_vertex.id IS NULL
     OR target_vertex.id IS NULL
     OR NOT ST_DWithin(
      ST_StartPoint(edge.geom)::geography,
      source_vertex.geom::geography,
      0.05
    )
     OR NOT ST_DWithin(
      ST_EndPoint(edge.geom)::geography,
      target_vertex.geom::geography,
      0.05
    );

  IF orientation_mismatch_count > 0 THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        '%s road edges are not oriented from their imported source to target vertex.',
        orientation_mismatch_count
      ),
      HINT = 'Check the osm2pgrouting version/import before using directional costs.';
  END IF;
END
$network_guard$ LANGUAGE plpgsql;

COMMENT ON TABLE routing.road_edges IS
  'OSM road segments for ordinary motor-car routing. Source/target topology is retained from osm2pgrouting; costs are permitted segment lengths in metres.';

COMMENT ON COLUMN routing.road_edges.cost IS
  'Forward source-to-target length in metres, or -1 when forward travel is prohibited.';

COMMENT ON COLUMN routing.road_edges.reverse_cost IS
  'Reverse target-to-source length in metres, or -1 when reverse travel is prohibited.';

COMMIT;
