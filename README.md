# UNIMED Healthcare Provider Locator

UNIMED Provider Locator is an academic GIS web application for finding healthcare providers in Zomba, Malawi. It combines a database-backed provider directory with an interactive map and PostGIS proximity search so users can explore providers by location, distance, service, and category.

## Current features

- Displays active providers with coordinates in a list and on a Leaflet map.
- Loads provider and service information from PostgreSQL through server-only Next.js Route Handlers.
- Offers explicit **Use my location** and **Choose on map** actions plus a starting-point dropdown populated from the complete provider directory.
- Uses a compact two-row desktop search toolbar so the results and map remain visible at normal laptop viewport sizes.
- Keeps manual latitude and longitude fields available in a collapsed **Advanced** disclosure.
- Searches within 1, 5, 10, 17, 20, or 50 km.
- Keeps **Straight-line radius** as the default and adds an optional **Shortest by road** mode backed by a separate pgRouting database.
- Filters in PostgreSQL by assigned service and provider category.
- Shows a red applied starting-location marker, an amber unapplied draft marker, a search-radius circle, stable distance ordering, and straight-line distances.
- Keeps draft controls separate from the last successful search so the list and map always describe the same applied criteria.
- Requests browser geolocation only after the user selects **Use my location**, with map and provider alternatives when location access fails.
- Handles loading, validation, geolocation, empty-result, API-error, reset, and stale-request states.
- Lets keyboard and pointer users focus a provider marker from its compact result card, with long service lists available through an expand/collapse control.
- Provides a **Get directions** link in each provider map popup. It opens Google Maps with the provider's stored coordinates as the destination; no API key or geocoding request is used.
- Labels road distances separately, reports off-network or unreachable providers, and fetches/draws route geometry only when a reachable road result is selected.
- Gives the results list its own scroll area while the Leaflet map fills the remaining workspace and resizes without resetting the chosen map view.

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with PostGIS
- Optional pgRouting road graph imported from OpenStreetMap data
- `pg` (`node-postgres`) with a reusable server-side connection pool
- Leaflet 1.9.4 and OpenStreetMap tiles

## Local setup

Prerequisites:

- Node.js 22 LTS (minimum `22.6.0`) and npm. Next.js supports older Node versions, but this repository's test command requires the type-stripping support added in Node 22.6.
- PostgreSQL with a matching PostGIS server package. The inspected source environment used PostgreSQL 18.3 and PostGIS 3.7.0.

First, create a separate database, seed the sample catalogue, verify its spatial results, and create a read-only application login. Follow [database/README.md](database/README.md) in full. It provides both Windows pgAdmin and `psql` instructions and runs these files in order:

1. `database/01_schema.sql`
2. `database/02_seed.sql`
3. `database/03_verify.sql`

The setup is for a fresh database only. It does not replace, migrate, or clear an existing populated database.

Road routing is optional and deliberately isolated from that database. To enable it, create the separate `unimed_provider_locator_routing_test` database and follow [database/routing/README.md](database/routing/README.md). That guide pins the road-data source, covers the Zomba-area extract (including St Luke and Pirimiti), preserves OSM access/one-way topology, builds metre-based costs, runs fixture and coverage checks, and creates a read-only routing login. Do not run its import or `--clean` commands against the existing application database.

Install the locked JavaScript dependencies and create the local environment file:

```powershell
npm ci
Copy-Item .env.example .env.local
```

On macOS or Linux, use:

```bash
npm ci
cp .env.example .env.local
```

Set the local values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `PGHOST` | PostgreSQL host |
| `PGPORT` | PostgreSQL port |
| `PGDATABASE` | Database name |
| `PGUSER` | Application database role |
| `PGPASSWORD` | Application role password |

The following server-only variables are optional and are used only by **Shortest by road**:

| Variable | Purpose |
| --- | --- |
| `ROUTING_PGHOST` | Separate routing database host |
| `ROUTING_PGPORT` | Separate routing database port |
| `ROUTING_PGDATABASE` | Routing database name (`unimed_provider_locator_routing_test`) |
| `ROUTING_PGUSER` | Read-only routing application role |
| `ROUTING_PGPASSWORD` | Routing role password |

Either set all five routing variables or leave all five unset. With them unset—or before the routing schema and road data are ready—the application still starts normally and straight-line search is unaffected; road mode returns a clear setup-unavailable response.

Use the restricted read-only roles created in the relevant database guides, not a database administrator. Do not expose these variables with a `NEXT_PUBLIC_` prefix. `.env.local` and other local environment files are ignored by Git; `.env.example` contains names and placeholders only. If a password contains `#`, spaces, or other dotenv syntax characters, quote it in `.env.local`.

Run the local checks:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000/providers](http://localhost:3000/providers). With the supplied seed, these startup checks should report `11`, `12`, and `9` respectively:

```powershell
(Invoke-RestMethod 'http://localhost:3000/api/providers').count
(Invoke-RestMethod 'http://localhost:3000/api/services').count
(Invoke-RestMethod 'http://localhost:3000/api/providers/nearby?latitude=-15.385343687941972&longitude=35.332129450877574&radius_km=5').count
```

## API

### `GET /api/providers`

Returns every active provider with a location. This example is abridged; the supplied seed returns 11 entries in `providers`:

```json
{
  "count": 11,
  "providers": [
    {
      "id": "1",
      "name": "Malmed",
      "category": "Private",
      "district": "Zomba",
      "address": null,
      "phone": null,
      "latitude": -15.383457318605885,
      "longitude": 35.322093933683,
      "services": ["General OPD"]
    }
  ]
}
```

### `GET /api/providers/nearby`

Query parameters:

| Parameter | Required | Validation |
| --- | --- | --- |
| `latitude` | Yes | Finite number from -90 through 90 |
| `longitude` | Yes | Finite number from -180 through 180 |
| `radius_km` | Yes | Greater than 0 and at most 100 |
| `service_id` | No | Positive ID for a service assigned to an active, located provider |
| `category` | No | Existing category for an active, located provider |

Example:

```text
/api/providers/nearby?latitude=-15.385343687941972&longitude=35.332129450877574&radius_km=5
```

Successful response:

```json
{
  "count": 9,
  "origin": {
    "latitude": -15.385343687941972,
    "longitude": 35.332129450877574
  },
  "radius_km": 5,
  "distance_type": "straight-line",
  "providers": [
    {
      "id": "10",
      "name": "UNIMA Clinic",
      "category": "University",
      "district": "Zomba",
      "address": null,
      "phone": null,
      "latitude": -15.385343687941972,
      "longitude": 35.332129450877574,
      "services": ["General OPD"],
      "distance_km": 0
    }
  ]
}
```

Invalid inputs return HTTP `400` with a generic error and safe validation details. Unexpected database failures return a generic HTTP `500` response while the useful error is logged only on the server.

### `GET /api/providers/road`

This optional endpoint uses the separate routing database. Query parameters:

| Parameter | Required | Validation |
| --- | --- | --- |
| `latitude` | Yes | Finite number from -90 through 90 |
| `longitude` | Yes | Finite number from -180 through 180 |
| `max_road_distance_km` | No | Greater than 0 and at most 500; omitted means no maximum |
| `service_id` | No | Positive ID assigned to an active, located provider |
| `category` | No | Existing active provider category |

The endpoint filters the provider catalogue first, snaps the origin and matching providers to eligible roads within 500 metres, calculates directed shortest paths in metres, optionally applies the maximum to the computed road distance, and sorts reachable results by unrounded road distance then provider ID. A result has one of these states:

- `reachable`, with `road_distance_km`;
- `snap-too-far`, when the origin or provider has no eligible edge within 500 metres;
- `unreachable`, when both points snap but the directed graph has no path.

Road distance includes partial first and last road segments. It excludes the straight-line gap from each stored point to its snapped road point; `origin_snap_distance_m` and `provider_snap_distance_m` expose those gaps separately. Straight-line `distance_km` is never reused for road results.

Example (after optional routing setup):

```text
/api/providers/road?latitude=-15.385343687941972&longitude=35.332129450877574&max_road_distance_km=20
```

Missing routing environment variables, pgRouting functions, or imported graph data return HTTP `503` with code `ROUTING_UNAVAILABLE`. Validation returns `400`; an unexpected routing failure returns `500` with code `ROUTING_ERROR`.

### `GET /api/providers/road/routes`

This endpoint is called only when a user selects a reachable road result. It accepts `latitude`, `longitude`, and `provider_id`, uses the applied (not draft) starting location, and returns a network-only GeoJSON `LineString` plus the road and snap distances. The map draws the road line solid and the excluded origin/provider snap gaps as dashed access links. An inactive or unknown provider returns `404`; a valid but unsnappable or disconnected selection returns `422` with `SNAP_TOO_FAR` or `NO_ROUTE`; missing optional setup returns `503`.

### `GET /api/services`

Returns services that are assigned to at least one active provider with a location. This example is abridged; the supplied seed returns 12 entries in `services`:

```json
{
  "count": 12,
  "services": [
    {
      "id": "1",
      "name": "General OPD"
    }
  ]
}
```

## Spatial calculation

The nearby endpoint constructs the starting location as a WGS84 geography point with longitude first:

```sql
ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
```

`ST_DWithin` performs the indexed radius filter in metres. `ST_Distance` calculates the unrounded geography distance, which is divided by 1,000 for `distance_km`. Results are ordered by the unrounded distance and then provider ID. The service filter uses `EXISTS`, preventing providers with multiple service assignments from appearing more than once.

These values are straight-line surface distances, not road-network distances, routes, travel times, or transport estimates.

### Road calculation

The optional graph stores one directed cost per permitted direction in metres. It keeps the importer's actual OSM node IDs as `source` and `target`, so roads connect only at real shared nodes rather than at every geometric crossing. Explicit access tags and one-way direction determine whether `cost_m` or `reverse_cost_m` is usable; negative costs remove a direction.

`routing.route_costs` uses an indexed WGS84 geography nearest-edge search, records each snap fraction and evaluates direction-valid source/target endpoint combinations with `pgr_dijkstraCost`. It measures partial first/last substrings as geography lengths and adds a direct same-edge candidate, which is required for two points on one segment. `routing.route_geometry` uses the same chosen candidate and `pgr_dijkstra`, clips partial endpoint segments, preserves path order and returns the network-only line in WGS84 for Leaflet. This implementation intentionally does not depend on `pgr_withPoints*`; see the compatibility note in [database/routing/README.md](database/routing/README.md).

## Available checks

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

The focused unit tests cover required, blank, malformed, duplicated, and out-of-range search parameters; stale-response invalidation; every location-selection state transition; helpful geolocation failures; manual override; applied/draft separation; and reset state. They do not connect to PostgreSQL or execute Route Handlers. Run `database/03_verify.sql` for database and spatial assertions, then use the endpoint checks in [Local setup](#local-setup) for the application-to-database path.

The same JavaScript suite also covers default/switching search modes, road-limit validation, endpoint/query construction, route-request validation, and road draft canonicalisation. Directed path correctness is database-level behaviour: run `database/routing/fixtures/01_small_graph.sql` in the separate routing test database for nearest-by-road ordering, one-way, same-segment, disconnected, filter, maximum and tie cases, then run `database/routing/03_verify.sql` after the real import.

## Manual verification

Use the known UNIMA Clinic starting point from the dropdown. Its stored coordinates are also useful when checking the advanced manual fields:

- Latitude: `-15.385343687941972`
- Longitude: `35.332129450877574`

With no service or category filter, verify the current data returns:

- 1 km: 2 providers (`UNIMA Clinic` and `MASM`)
- 5 km: 9 providers
- 17 km: 10 providers
- 20 km: 11 providers
- UNIMA Clinic: approximately 0.00 km

Also verify:

1. Loading the page does not request location permission. **Use my location** labels a successful choice as **Your current location**; denial or an unavailable position suggests the map and starting-point dropdown.
2. **Choose on map** scrolls the map into view, shows **Click the map to choose your starting location**, and creates an amber draft marker only after a map click.
3. Choosing **UNIMA Clinic** uses its stored coordinates and displays its name. The dropdown continues to contain the complete provider list even after a filtered or zero-result search.
4. Editing either field in **Advanced** changes the summary to **Manually entered location** and clears any current-location or provider identity.
5. Selecting **Search nearby** without a location shows only: **Choose your location, select a starting point, or click the map.** Partial, malformed, or out-of-range manual coordinates show detailed coordinate validation.
6. After a completed search, choosing another location changes only the draft summary and amber marker. The existing list, red marker, circle, and applied summary remain aligned until **Search nearby** is selected again.
7. Service and category filters reduce the results appropriately and preserve nearest-first ordering and **Straight-line distance** labels.
8. A valid search around `0, 0` produces zero results while keeping its applied starting location and radius visible.
9. **Reset** cancels an in-flight search, clears location and filters, removes search markers and the circle, and restores the complete map and list.
10. Rapid consecutive searches cannot let an older response replace a newer one, and clicking a provider card still focuses its blue map marker and opens its popup.
11. Missing or blank coordinates/radius, invalid IDs, and out-of-range values sent directly to the nearby API return HTTP `400`.
12. At desktop widths, the normal toolbar, results heading, and a usable map area are visible together. At mobile widths, controls stack without horizontal overflow and the results and map remain available through normal page scrolling.
13. Opening a provider marker popup and following **Get directions** opens Google Maps in a new tab with that provider's stored coordinates as the destination. The locator does not send a starting location in the link.
14. Switching to **Shortest by road** does not apply until **Search nearby** is selected. Radius and its circle disappear only after a successful road search; switching the draft back does not relabel old road results.
15. With routing intentionally unconfigured, road search reports that setup is unavailable and leaves the previous successful results intact while straight-line searches continue to work.
16. With the routing test database configured, search from **UNIMA Clinic**, confirm distances say **Road distance**, select a reachable result and confirm a solid purple route plus clearly dashed snap-access links reach that provider. Confirm an unreachable result says **No road route available** without being treated as a database error.

## Limitations

- Straight-line distances do not account for roads, terrain, traffic, or travel time. Road mode measures eligible network length only; it is not a travel-time estimate.
- Map tiles are © OpenStreetMap contributors, require internet access, and are subject to OpenStreetMap tile availability and usage policy.
- The optional OSM graph does not evaluate traffic, speeds, live closures, turn-restriction relations, barriers, time-dependent access, or conditional one-way rules. Snap connectors are straight-line approximations and are excluded from displayed road distance.
- This version has no administration, authentication, paid routing service, travel-time calculation, or deployment configuration.
