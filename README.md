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
- Gives the results list its own scroll area while the Leaflet map fills the remaining workspace and resizes without resetting the chosen map view.

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

The focused tests cover required, blank, malformed, duplicated, and out-of-range search parameters; stale-response invalidation; every location-selection state transition; helpful geolocation failures; manual override; applied/draft separation; and reset state.

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

## Limitations

- Provider records and service assignments are the supplied academic dataset and may not be complete or current.
- Categories intentionally remain unspecified where the source data contains `NULL`.
- Distances do not account for roads, terrain, traffic, or travel time.
- Map tiles require internet access and are subject to OpenStreetMap tile availability and usage policy.
- No external geocoder is used; named starting points come only from the supplied provider records.
- This version has no administration, authentication, routing, paid services, or deployment configuration.
