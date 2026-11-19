# Optional shortest-by-road database

Road search is an optional layer. The normal application database and its
straight-line PostGIS search do not need pgRouting or any road tables. Build
this layer only in a separate database named
`unimed_provider_locator_routing_test`; every setup and verification script
refuses any other database name.

The workflow does not update provider records in an existing database. It
recreates the tracked catalogue in the isolated database, including the
corrected Zomba City Clinic point (`35.32307989318453,
-15.391769141755343`).

## What the routing model means

- `routing.road_edges` retains osm2pgrouting's source and target vertices. A
  geometric crossing is not made into a junction unless it is connected by an
  actual OpenStreetMap node.
- Forward and reverse costs are permitted segment length in metres. A negative
  directional cost means that direction is unavailable.
- The finalisation script applies the ordinary-car access hierarchy
  `motorcar`, `motor_vehicle`, `vehicle`, then `access`, including directional
  variants. It accepts `yes`, `permissive`, `designated`, `destination`, and
  `customers`; explicit restrictions and unknown non-empty values are excluded
  conservatively.
- `oneway:motorcar`, `oneway:motor_vehicle`, `oneway:vehicle`, and `oneway`
  are considered in that order. Roundabouts are forward-only unless explicitly
  overridden, as are motorways and motorway links with no explicit oneway tag.
  Reverse (`-1`) ways are preserved.
- A starting point or provider must be no more than **500 metres** from an
  eligible road. Snapping returns the straight origin/provider access distances
  separately.
- The displayed `road_distance_m` is road-network length only. It excludes the
  two straight snap connectors; route geometry likewise begins and ends at the
  snapped road points. This avoids presenting off-road straight lines as roads.
- Partial first/last segments and two points on the same segment are costed by
  their line fractions. The functions use `pgr_dijkstraCost` and
  `pgr_dijkstra`, not `pgr_withPoints`, so they avoid the pgRouting 4.0.1
  Windows `withPoints` regression.

The public application contracts are:

```sql
routing.route_costs(
  origin geometry(Point, 4326),
  destination_provider_ids bigint[],
  max_snap_m double precision DEFAULT 500
)

routing.route_geometry(
  origin geometry(Point, 4326),
  provider_id bigint,
  max_snap_m double precision DEFAULT 500
)
```

Statuses are `reachable`, `snap-too-far`, and `unreachable`. A missing schema,
extension, or road import is a setup error for the API to report as routing
unavailable; it is not an unreachable route.

## Prerequisites

Install:

- PostgreSQL and matching PostGIS and pgRouting server packages;
- osm2pgrouting **3.x** (the finalisation script targets its `ways` schema);
- osmium-tool for a complete-ways bounding-box extract.

The commands below are PowerShell examples run from the repository root. Change
only executable paths, host, port, and administrator name for your installation.
Do not put a password in a command or tracked file. Use `-W` where supported,
or a local `PGPASSFILE` protected by operating-system permissions.

```powershell
$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
$PsqlExe = Join-Path $PgBin 'psql.exe'
$CreatedbExe = Join-Path $PgBin 'createdb.exe'
$Osm2PgroutingExe = Join-Path $PgBin 'osm2pgrouting.exe'
$OsmiumExe = 'C:\Program Files\Osmium\bin\osmium.exe'

& $PsqlExe --version
& $Osm2PgroutingExe --version
& $OsmiumExe --version
```

## 1. Create the isolated database and catalogue

Create only the fixed test database. If that name already exists, inspect it
and deliberately archive or remove it before rebuilding; the repository scripts
will not replace an existing routing graph.

```powershell
& $CreatedbExe -X -h localhost -p 5432 -U postgres -W `
  --owner=postgres unimed_provider_locator_routing_test

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\01_schema.sql

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\02_seed.sql

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\03_verify.sql

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\routing\00_extensions.sql
```

`00_extensions.sql` enables PostGIS, pgRouting, and hstore only in this test
database and creates empty `routing_import` and `routing` schemas.

## 2. Download and verify Malawi OpenStreetMap data

There is no road dataset committed to this repository. Download the pinned
Malawi extract and its checksum from
[Geofabrik](https://download.geofabrik.de/africa/malawi.html). Geofabrik's
extract is derived from OpenStreetMap and is licensed under the Open Database
License. Keep the attribution **© OpenStreetMap contributors** wherever the
derived routes are presented; see the
[OpenStreetMap copyright page](https://www.openstreetmap.org/copyright).

Downloaded/derived files under `database/routing/data/` are ignored by Git.

```powershell
$DataDir = Resolve-Path .\database\routing\data
$MalawiPbf = Join-Path $DataDir 'malawi-261117.osm.pbf'
$ExpectedBytes = 156212759
$ExpectedHash = '552CD20125FA6D3DA4E779F28BA87FFA'

Invoke-WebRequest `
  'https://download.geofabrik.de/africa/malawi-261117.osm.pbf' `
  -OutFile $MalawiPbf

$ActualBytes = (Get-Item $MalawiPbf).Length
if ($ActualBytes -ne $ExpectedBytes) {
  throw "Geofabrik size mismatch: expected $ExpectedBytes bytes, got $ActualBytes"
}

$ActualHash = (Get-FileHash $MalawiPbf -Algorithm MD5).Hash.ToUpperInvariant()
if ($ActualHash -ne $ExpectedHash) {
  throw "Geofabrik checksum mismatch: expected $ExpectedHash, got $ActualHash"
}
```

The canonical project snapshot is Geofabrik's **2026-11-17** Malawi extract
(`261117`). The project pins its exact byte size and MD5 because Geofabrik's
separate checksum URL for older daily extracts may no longer be available even
while the dated PBF remains downloadable. Also archive the exact PBF in durable
project or institutional storage and record its retrieval date, original URL,
byte size, and MD5 in the report. The changing `malawi-latest.osm.pbf` URL may
be used only when intentionally refreshing the experiment; a refresh creates a
new dataset version and requires recording its new checksum and rerunning every
verification.

## 3. Extract complete Zomba-area ways

The bbox is `west,south,east,north = 35.20,-15.60,35.60,-15.10`.
It contains every tracked provider with a buffer, explicitly including:

- St Luke at `35.35283560854577, -15.208248129662438`;
- Pirimiti Mission Hospital at `35.45042037971602,
  -15.48157217321732`.

`complete_ways` retains nodes outside the rectangle when they belong to a way
crossing the boundary, avoiding clipped way topology.

```powershell
$ZombaPbf = Join-Path $DataDir 'zomba-routing.osm.pbf'
$ZombaOsm = Join-Path $DataDir 'zomba-routing.osm'

& $OsmiumExe extract `
  --bbox=35.20,-15.60,35.60,-15.10 `
  --strategy=complete_ways `
  --overwrite `
  --output=$ZombaPbf `
  $MalawiPbf

& $OsmiumExe cat `
  --overwrite `
  --output=$ZombaOsm `
  $ZombaPbf

& $OsmiumExe fileinfo --extended $ZombaPbf
```

The rectangle proves geographic coverage, not routability. The verification
script later checks actual road snapping and connectivity for all 11 providers.

## 4. Import and finalise the car graph

The `--tags` option is mandatory: the finalisation step reads access, one-way,
area, junction, and highway tags. `--addnodes` preserves the raw OSM records for
auditing. `--clean` is safe here only because the command targets the new
`routing_import` schema in the guarded test database.

```powershell
& $Osm2PgroutingExe `
  --file $ZombaOsm `
  --conf .\database\routing\mapconfig_for_cars.xml `
  --host localhost `
  --port 5432 `
  --dbname unimed_provider_locator_routing_test `
  --username postgres `
  --schema routing_import `
  --clean `
  --addnodes `
  --tags

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\routing\01_finalize_network.sql

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\routing\02_routing_functions.sql
```

Do not run `pgr_createTopology` on the final graph. The imported source/target
vertices already represent OSM-node connectivity; tolerance-based topology can
incorrectly join bridges, tunnels, and ordinary geometric crossings.

## 5. Verify real data and deterministic fixtures

```powershell
& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\routing\03_verify.sql

& $PsqlExe -X -h localhost -p 5432 -U postgres `
  -d unimed_provider_locator_routing_test -W -v ON_ERROR_STOP=1 `
  -f .\database\routing\fixtures\01_small_graph.sql
```

Real-data verification checks:

- metre costs and directed topology;
- all 11 provider snaps within 500 m;
- explicit St Luke and Pirimiti coverage;
- the corrected Zomba City Clinic record;
- reachability from UNIMA Clinic and a non-empty UNIMA-to-Zomba-Central route.

The fixture runs inside a transaction and ends with `ROLLBACK`. It checks a
geographically nearest provider that is not shortest by road, forward/reverse
one-way behaviour, same-segment partial cost, a disconnected provider,
service/category pre-filtering, stable provider-ID tie order, caller-side
maximum-distance filtering, and selected-route geometry.

## 6. Grant read-only application access

Create the application login outside tracked SQL, without elevated privileges.
At an administrator `psql` prompt, `\password` sets a local password without
echoing it or storing it in shell history:

```sql
CREATE ROLE unimed_locator_routing_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;
\password unimed_locator_routing_app
```

Then run these grants as the routing database owner after replacing
`unimed_locator_routing_app` only if your local read-only role uses another name:

```sql
REVOKE CONNECT, TEMPORARY
  ON DATABASE unimed_provider_locator_routing_test
  FROM PUBLIC;
GRANT CONNECT
  ON DATABASE unimed_provider_locator_routing_test
  TO unimed_locator_routing_app;

REVOKE CREATE ON SCHEMA public, routing FROM PUBLIC;
GRANT USAGE ON SCHEMA public, routing TO unimed_locator_routing_app;

GRANT SELECT
  ON TABLE public.providers, public.services, public.provider_service,
           routing.road_edges
  TO unimed_locator_routing_app;

GRANT EXECUTE
  ON FUNCTION routing._nearest_road(geometry),
              routing._route_plan(geometry, geometry, double precision),
              routing.route_costs(geometry, bigint[], double precision),
              routing.route_geometry(geometry, bigint, double precision)
  TO unimed_locator_routing_app;
```

Do not grant access to `routing_import`; it is retained only for provenance and
auditing. Configure the app's optional routing connection locally and keep its
password out of tracked files. If that connection or this graph is absent,
straight-line search remains the available default.

## Known limitations

- Results inherit OpenStreetMap completeness, tagging accuracy, and snapshot
  age. A passing snap check does not prove that the line is the real facility
  entrance.
- This is shortest **length**, not fastest travel time. It does not model
  traffic, road quality, turn penalties/restrictions, barriers, private-gate
  opening, ferries, or conditional/time-dependent access and one-way tags.
- Unknown explicit access values are excluded conservatively. Manual review is
  appropriate if a legitimate road is unexpectedly absent.
- Routes cannot leave the extraction boundary. The bbox buffer reduces but does
  not eliminate the chance that a globally shorter route would travel outside
  the extract.
- Off-road snap connectors are straight distance diagnostics only and are not
  included in road distance or route geometry.
