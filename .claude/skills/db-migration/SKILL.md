---
name: db-migration
description: Generate and apply Drizzle migrations in this codebase, across the dev and test databases. Use when changing lib/drizzle/schema, when a migration fails to apply, or when tests fail with "relation does not exist".
---

# Change the database schema

## The two-database rule

There are two local databases, and `db:migrate` only touches one of them:

```sh
pnpm db:generate       # write the migration file
pnpm db:migrate        # apply to saas_foundation
pnpm db:test:migrate   # apply to saas_foundation_test — a separate command
```

`pnpm db:migrate:all` runs both. Forgetting the second is the single most
common cause of a green type-check and a red test run, and the symptom is
`relation "..." does not exist` or a missing-column error.

## Generate with `db:generate` alone

`db:generate` runs `drizzle-kit generate` and nothing else. Do not chain a
repo-wide lint onto it: formatting the whole tree drags dozens of unrelated
files into the diff and buries the actual change. Format only what you edited:

```sh
pnpm exec biome check --write lib/drizzle/schema/<file>.ts
```

## Never edit an applied migration

Drizzle records what it has run. Editing an applied file leaves the recorded
state and the database disagreeing, and the next migration fails somewhere
unrelated. Write a new migration instead.

The exception is a migration generated seconds ago and not yet applied
anywhere — deleting and regenerating that one is fine.

## Push is for CI only

`.github/workflows/test.yml` uses `drizzle-kit push --force`, which is correct
there: CI starts from an empty database every run, so pushing is faster and the
result is identical. Locally, always migrate — the migration files are the
source of truth, and pushing silently drifts the database away from them.

## Resetting

When local data is disposable and the schema has drifted:

```sh
pnpm db:dev:reset     # drop, create, migrate, seed
pnpm db:test:reset    # drop, create, migrate
```

Both drop the database, so confirm before running them against anything
someone cares about.

## Hand-written SQL

`drizzle-kit generate` produces the file; there is nothing wrong with editing
it *before* it is applied to add something the schema cannot express — a
backfill, a partial index, a view. Keep such edits in their own migration so
the generated and hand-written parts stay separable.

## After a schema change

```sh
pnpm db:migrate:all
pnpm type-check && pnpm test:run
pnpm db:dbml          # optional: refresh docs/schema.dbml
```

## Better Auth tables

`lib/drizzle/schema/auth/` mirrors what Better Auth expects. It validates the
shape at runtime and refuses to write with `The field "x" does not exist in
the "y" Drizzle schema`. After upgrading `better-auth` across a major version,
check these tables first — `account` in particular has gained fields.

Custom columns on its tables (such as `session.activeOrganizationId`) must also
be declared in the Better Auth config under `additionalFields`. A column that
exists in Postgres but is not declared there is silently dropped on write:
the row saves, the value does not.
