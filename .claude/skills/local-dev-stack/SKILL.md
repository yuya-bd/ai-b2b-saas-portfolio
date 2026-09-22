---
name: local-dev-stack
description: Start, seed, inspect and reset the local development environment for this codebase — Postgres, Redis, ElasticMQ, Mailpit, the dev server, the queue worker, and email previews. Use when setting up the project, when a service will not connect, or when asked how to run or check something locally.
---

# Run the stack locally

## Ports are offset on purpose

| Service | Host port | Usual default | Why |
|---|---|---|---|
| Postgres | 5433 | 5432 | so another project's stack can run at the same time |
| Redis | 6380 | 6379 | same |
| ElasticMQ | 9326 / 9327 | 9324 / 9325 | same |
| Mailpit | 1026 SMTP, 8026 UI | 1025 / 8025 | same |

A connection refused on 5432 usually means a `DATABASE_URL` copied from
somewhere else. This project uses 5433.

## First run

```sh
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:test:create && pnpm db:test:migrate
pnpm db:seed:dev
pnpm dev
```

`--wait` blocks until every healthcheck passes, so the migration that follows
does not race the database.

## Signing in

`pnpm db:seed:dev` creates one user per role, all with password
`password1234`:

`owner@example.com`, `admin@example.com`, `department-admin@example.com`,
`editor@example.com`, `viewer@example.com`, `partner@example.com`

They are created through Better Auth's own sign-up API, not by inserting rows,
so the password hash is always right for the installed version.

Signing in stamps the session with the user's organization automatically, so
there is nothing else to set up before the API works. The partner user is
denied on most routes by design — that is the role behaving correctly, not a
broken seed.

## Emails

The dev sender posts to Mailpit. Open **http://localhost:8026** to read
anything the app sent — invitations, password resets, and so on.

To look at the templates without triggering a flow:

```sh
pnpm dev:email-preview
```

With `SMTP_HOST` unset the sender logs to the console instead, so a fresh
checkout still exercises the code path with nothing running.

## The queue worker

```sh
pnpm worker:dev      # worker only
pnpm dev:all         # docker + dev server + worker together
```

Three backends, chosen by environment:

- `USE_MOCK_SQS=true` — in-process, nothing to run. What tests use.
- `SQS_ENDPOINT` set — ElasticMQ, with real visibility timeouts and receipt handles
- neither — real AWS SQS

ElasticMQ's queue is defined in `docker/elasticmq/elasticmq.conf`. Its stats
page is at http://localhost:9327.

## Inspecting

```sh
pnpm db:studio                                        # Drizzle Studio
docker exec -it saas-foundation-db psql -U postgres -d saas_foundation
docker compose ps                                      # health of each service
docker compose logs -f postgres
curl -s localhost:3000/api/health                      # also checks the DB
```

`/api/health` runs a query, so a 200 means the app can actually serve, not just
that the process is up.

## Resetting

```sh
pnpm dev:reset       # tear down volumes, restart, migrate, seed
pnpm db:dev:reset    # database only, containers left alone
```

`dev:reset` runs `docker compose down -v`, which deletes the volumes. Compose
scopes that to this project's containers, but confirm before running it if
anything local is worth keeping.

## Stopping

```sh
pnpm dev:stop        # dev server, worker, and containers
docker compose down  # containers only
```
