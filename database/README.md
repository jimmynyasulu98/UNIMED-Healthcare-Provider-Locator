# Recreate the UNIMED database

These files build a separate, fresh database containing the academic sample catalogue used by the application:

1. `01_schema.sql` enables PostGIS in the target database and creates the tables, constraints, and indexes.
2. `02_seed.sql` inserts 11 providers, 12 services, and 23 provider-service assignments.
3. `03_verify.sql` fails if the catalogue, spatial index, coordinates, or known UNIMA Clinic radius results are wrong.

The scripts contain no `DROP`, `TRUNCATE`, database creation, role creation, or credentials. `01_schema.sql` refuses to run when any application table already exists. Always point the commands at a new database, not an existing populated database.

## Prerequisites and accounts

Install PostgreSQL and a PostGIS package built for the same PostgreSQL major version. Installing PostGIS adds the server binaries and extension control files; it does **not** enable PostGIS in every database. `01_schema.sql` runs `CREATE EXTENSION IF NOT EXISTS postgis` to enable it in the selected database.

On Windows, a matching PostGIS bundle can normally be installed through Stack Builder (Spatial Extensions) for the PostgreSQL installation. If `CREATE EXTENSION` reports that `postgis.control` is unavailable, install the matching server package before retrying in a new database.

The source catalogue was inspected on PostgreSQL 18.3 with PostGIS 3.7.0. The SQL uses standard supported PostgreSQL/PostGIS features, but other version combinations were not exercised for this project.

Use two different accounts:

- A PostgreSQL administrator or database owner creates the database, enables PostGIS, runs the three files, and grants access. Never put this account's password in the application's `.env.local`.
- `unimed_locator_app` is the read-only login used by Next.js. It must not own the database, schema, or tables and must not have superuser, database-creation, role-creation, replication, schema-creation, or table-write rights.

You may choose different database and role names, but then use those names consistently in the grants and `.env.local`.

## Option A: Windows pgAdmin

1. Connect to the PostgreSQL server as an administrator (often `postgres`).
2. In **Login/Group Roles**, create `unimed_locator_app`.
   - Set a password of your choice on the **Definition** tab.
   - Enable **Can login**.
   - Leave Superuser, Create roles, Create databases, Replication, and Bypass RLS disabled.
   - Using the role dialog keeps the new password out of Query Tool and shell history.
3. In **Databases**, create `unimed_provider_locator`. Set the administrator/database owner as its owner, not `unimed_locator_app`.
4. Open Query Tool specifically on `unimed_provider_locator` as the administrator. Use **File > Open**, then execute each file completely in this order, stopping if one reports an error:
   1. `database/01_schema.sql`
   2. `database/02_seed.sql`
   3. `database/03_verify.sql`
5. Still connected to `unimed_provider_locator` as the administrator, run the [least-privilege grants](#grant-only-read-access) below.
6. Reconnect as `unimed_locator_app` and run the [permission check](#check-the-application-role).

The scripts are plain SQL and contain no psql-only commands, so the same files work in pgAdmin Query Tool.

## Option B: psql

Run these commands from the repository root. If `psql` is not on `PATH`, set its installed path first (replace `18` if your PostgreSQL major version differs):

```powershell
$PsqlExe = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $PsqlExe --version
```

Connect to the maintenance database as the administrator. `-W` prompts for the administrator password instead of placing it in the command, and `ON_ERROR_STOP` makes SQL errors stop the operation:

```powershell
& $PsqlExe -X -h localhost -p 5432 -U postgres -d postgres -W -v ON_ERROR_STOP=1
```

At the psql prompt, create the restricted login and database. `\password` prompts twice without echoing the password or storing it in shell history:

```sql
CREATE ROLE unimed_locator_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;
\password unimed_locator_app
CREATE DATABASE unimed_provider_locator OWNER postgres;
\q
```

Replace `postgres` with the real administrator/owner name if necessary. `CREATE DATABASE` must be issued while connected to a maintenance database and must not be placed inside a transaction.

Execute the setup files as the administrator/database owner, in order:

```powershell
& $PsqlExe -X -h localhost -p 5432 -U postgres -d unimed_provider_locator -W -v ON_ERROR_STOP=1 -f .\database\01_schema.sql
& $PsqlExe -X -h localhost -p 5432 -U postgres -d unimed_provider_locator -W -v ON_ERROR_STOP=1 -f .\database\02_seed.sql
& $PsqlExe -X -h localhost -p 5432 -U postgres -d unimed_provider_locator -W -v ON_ERROR_STOP=1 -f .\database\03_verify.sql
```

`03_verify.sql` should finish with this notice:

```text
Database verification passed: 11 providers, 12 services, 23 assignments; UNIMA radius checks returned 2/9/10/11.
```

## Grant only read access

Run the following while connected to `unimed_provider_locator` as its administrator/owner. These grants are intentionally limited to the three application tables; the app does not need sequence permissions.

```sql
REVOKE CONNECT, TEMPORARY
  ON DATABASE unimed_provider_locator
  FROM PUBLIC;
GRANT CONNECT
  ON DATABASE unimed_provider_locator
  TO unimed_locator_app;

REVOKE CREATE
  ON SCHEMA public
  FROM PUBLIC;
REVOKE ALL PRIVILEGES
  ON SCHEMA public
  FROM unimed_locator_app;
GRANT USAGE
  ON SCHEMA public
  TO unimed_locator_app;

REVOKE ALL PRIVILEGES
  ON TABLE public.providers, public.services, public.provider_service
  FROM PUBLIC;
REVOKE ALL PRIVILEGES
  ON TABLE public.providers, public.services, public.provider_service
  FROM unimed_locator_app;
GRANT SELECT
  ON TABLE public.providers, public.services, public.provider_service
  TO unimed_locator_app;
```

The database owner keeps its owner rights. The app role receives only database connection, schema usage, and table reads.

## Check the application role

Connect using the read-only account. psql prompts for the application password:

```powershell
& $PsqlExe -X -h localhost -p 5432 -U unimed_locator_app -d unimed_provider_locator -W -v ON_ERROR_STOP=1
```

Then run:

```sql
SELECT
  has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
  has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
  has_table_privilege(current_user, 'public.providers', 'SELECT') AS can_read_providers,
  has_table_privilege(current_user, 'public.providers', 'INSERT') AS can_insert_providers;

SELECT COUNT(*) AS providers FROM public.providers;
SELECT COUNT(*) AS services FROM public.services;
SELECT COUNT(*) AS assignments FROM public.provider_service;
```

The privilege row should be `true, true, true, false`; the counts should be `11`, `12`, and `23`.

## Reruns and failures

- Run `01_schema.sql` only on a new database. It stops rather than overwriting application tables.
- `02_seed.sql` never updates or deletes rows. On the canonical schema it can be rerun without duplicating named rows or assignments, and it safely advances both identity generators after preserving the catalogue IDs.
- `03_verify.sql` is read-only. Its exact-count checks intentionally fail after the sample catalogue has been customized.
- If any initial setup file fails, read the first error. The safest recovery is to create another empty database and repeat the ordered steps. Do not point the scripts at the existing populated project database.

After the database and application role pass these checks, continue with the root [README](../README.md#local-setup).
