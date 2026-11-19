# UNIMED Healthcare Provider Locator

UNIMED Provider Locator is an academic GIS web application for finding healthcare providers in Zomba, Malawi. It combines a database-backed provider directory with an interactive map and PostGIS proximity search so users can explore providers by location, distance, service, and category.

## Current features

- Displays active providers with coordinates in a list and on a Leaflet map.
- Loads provider and service information from PostgreSQL through server-only Next.js Route Handlers.
- Offers explicit **Use my location** and **Choose on map** actions plus a starting-point dropdown populated from the complete provider directory.
- Uses a compact two-row desktop search toolbar so the results and map remain visible at normal laptop viewport sizes.
- Keeps manual latitude and longitude fields available in a collapsed **Advanced** disclosure.
- Searches within 1, 5, 10, 17, 20, or 50 km.
- Filters in PostgreSQL by assigned service and provider category.
- Shows a red applied starting-location marker, an amber unapplied draft marker, a search-radius circle, stable distance ordering, and straight-line distances.
- Keeps draft controls separate from the last successful search so the list and map always describe the same applied criteria.
- Requests browser geolocation only after the user selects **Use my location**, with map and provider alternatives when location access fails.
- Handles loading, validation, geolocation, empty-result, API-error, reset, and stale-request states.
- Lets keyboard and pointer users focus a provider marker from its compact result card, with long service lists available through an expand/collapse control.
- Provides a **Get directions** link in each provider map popup. It opens Google Maps with the provider's stored coordinates as the destination; no API key or geocoding request is used.
- Gives the results list its own scroll area while the Leaflet map fills the remaining workspace and resizes without resetting the chosen map view.

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with PostGIS
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

Use the read-only application role created in the database guide, not the database administrator. Do not expose these variables with a `NEXT_PUBLIC_` prefix. `.env.local` and other local environment files are ignored by Git; `.env.example` contains names and placeholders only. If a password contains `#`, spaces, or other dotenv syntax characters, quote it in `.env.local`.

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

## Available checks

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

The focused unit tests cover required, blank, malformed, duplicated, and out-of-range search parameters; stale-response invalidation; every location-selection state transition; helpful geolocation failures; manual override; applied/draft separation; and reset state. They do not connect to PostgreSQL or execute Route Handlers. Run `database/03_verify.sql` for database and spatial assertions, then use the endpoint checks in [Local setup](#local-setup) for the application-to-database path.

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

## Limitations

- Provider records and service assignments are a snapshot of the supplied academic catalogue, not a verified or current healthcare directory.
- Each of the 11 provider rows preserves its stored Google Maps short link in `data_source` for provenance only. A link does not guarantee a provider's current identity, location, or services.
- All `verified_on`, address, and phone values are unknown (`NULL`), and two categories intentionally remain unspecified because the source data contains `NULL`.
- Distances do not account for roads, terrain, traffic, or travel time.
- Map tiles are © OpenStreetMap contributors, require internet access, and are subject to OpenStreetMap tile availability and usage policy.
- No external geocoder is used; named starting points come only from the supplied provider records.
- Road directions are handled by Google Maps only after a user follows **Get directions**. The locator itself does not calculate routes or travel times.
- This version has no administration, authentication, built-in route calculation, paid services, or deployment configuration.
