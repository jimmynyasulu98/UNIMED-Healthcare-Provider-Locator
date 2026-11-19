# UNIMED Healthcare Provider Locator

UNIMED Provider Locator is an academic GIS web application for finding healthcare providers in Zomba, Malawi. It combines a database-backed provider directory with an interactive map and PostGIS proximity search so users can explore providers by location, distance, service, and category.

## Current features

- Displays active providers with coordinates in a list and on a Leaflet map.
- Loads provider and service information from PostgreSQL through server-only Next.js Route Handlers.
- Accepts a map click, editable coordinates, or an explicitly requested browser location as a search origin.
- Searches within 1, 5, 10, 17, 20, or 50 km.
- Filters in PostgreSQL by assigned service and provider category.
- Shows an applied origin marker, search-radius circle, stable distance ordering, and straight-line distances.
- Keeps draft controls separate from the last successful search so the list and map always describe the same applied criteria.
- Handles loading, validation, geolocation, empty-result, API-error, reset, and stale-request states.
- Lets keyboard and pointer users focus a provider marker from its result card.

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- PostgreSQL with PostGIS
- `pg` (`node-postgres`) with a reusable server-side connection pool
- Leaflet 1.9.4 and OpenStreetMap tiles

## Local setup

Prerequisites:

- A supported Node.js release and npm
- PostgreSQL with PostGIS
- The existing `unimed_provider_locator` database, tables, provider records, service assignments, and `providers.location` GiST index

Install and configure the project:

```powershell
npm install
Copy-Item .env.example .env.local
```

Set the local values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `PGHOST` | PostgreSQL host |
| `PGPORT` | PostgreSQL port |
| `PGDATABASE` | Database name |
| `PGUSER` | Application database role |
| `PGPASSWORD` | Application role password |

Do not expose these variables with a `NEXT_PUBLIC_` prefix. `.env.local` and other local environment files are ignored by Git; `.env.example` contains names and placeholders only.

Start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000/providers](http://localhost:3000/providers).

## API

### `GET /api/providers`

Returns every active provider with a location:

```json
{
  "count": 11,
  "providers": [
    {
      "id": "1",
      "name": "Example provider",
      "category": "Clinic",
      "district": "Zomba",
      "address": null,
      "phone": null,
      "latitude": -15.3853,
      "longitude": 35.3321,
      "services": ["General consultation"]
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

Returns services that are assigned to at least one active provider with a location:

```json
{
  "count": 1,
  "services": [
    {
      "id": "1",
      "name": "General OPD"
    }
  ]
}
```

## Spatial calculation

The nearby endpoint constructs the origin as a WGS84 geography point with longitude first:

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

The focused tests cover required, blank, malformed, duplicated, and out-of-range search parameters plus stale-response invalidation.

## Manual verification

Use the known UNIMA Clinic origin:

- Latitude: `-15.385343687941972`
- Longitude: `35.332129450877574`

With no service or category filter, verify the current data returns:

- 1 km: 2 providers (`UNIMA Clinic` and `MASM`)
- 5 km: 9 providers
- 17 km: 10 providers
- 20 km: 11 providers
- UNIMA Clinic: approximately 0.00 km

Also verify:

1. A map click updates only the draft coordinates until **Find nearby providers** is selected.
2. Editing an applied search shows the unapplied-changes notice without moving the existing circle or replacing results.
3. Service and category filters reduce the results appropriately.
4. A no-result search keeps the red origin and radius circle visible.
5. **Show all providers** cancels an in-flight search and restores all providers.
6. Rapid consecutive searches cannot let an older response replace a newer one.
7. Clicking a provider card focuses its blue marker and opens its popup.
8. Missing or blank coordinates/radius, invalid IDs, and out-of-range values return HTTP `400`.
9. Denying location permission shows a helpful fallback and does not prevent manual or map-based searching.

## Limitations

- Provider records and service assignments are the supplied academic dataset and may not be complete or current.
- Categories intentionally remain unspecified where the source data contains `NULL`.
- Distances do not account for roads, terrain, traffic, or travel time.
- Map tiles require internet access and are subject to OpenStreetMap tile availability and usage policy.
- This version has no administration, authentication, routing, paid services, or deployment configuration.
