# saas-foundation

[![Test](https://github.com/yuya-bd/ai-b2b-saas-portfolio/actions/workflows/test.yml/badge.svg)](https://github.com/yuya-bd/ai-b2b-saas-portfolio/actions/workflows/test.yml)

A reference foundation for **multi-tenant B2B applications**: Next.js App
Router, Drizzle, Better Auth and Postgres, with one worked vertical slice
showing how a resource is built.

It is a starting point and a reference, not a product. Copy it, or read it to
see how a piece was solved before.

## Getting started

```sh
pnpm install
cp .env.example .env
cp .env.test.example .env.test
docker compose up -d --wait
pnpm db:migrate
pnpm db:test:create && pnpm db:test:migrate
pnpm db:seed:dev
pnpm dev:all
```

Open http://localhost:3000 and sign in as `admin@example.com` with password
`password1234`. The seed creates one user per role, so every permission branch
can be exercised by hand.

`dev:all` rather than `dev` because it starts the job worker too. Asking a
company for an analysis queues work; with no worker the request is accepted and
then nothing happens, which looks like a bug and is not one.

Ports are offset from the usual defaults (Postgres 5433, Redis 6380, Mailpit
8026) so this stack can run alongside another project's.

## What is here

| Concern | Where |
|---|---|
| Multi-tenancy | tenant → organization → department, with every business row scoped to an organization |
| Authentication | Better Auth, email and password, rate-limited, sessions cached in Redis |
| Authorization | six roles including an external `partner_member` that is denied by default |
| API layer | thin route handlers over services over repositories, with one central error handler |
| Validation | zod schemas that deliberately cannot accept a tenant id from the client |
| Audit logging | one route-to-action table; writes happen after the response is sent |
| Caching | Redis with graceful degradation — no Redis means more queries, not an outage |
| Background jobs | SQS producer and worker, with in-process, ElasticMQ and real-AWS modes |
| AI analysis | one provider interface behind an Anthropic implementation and a mock; the answer is validated into columns, so nothing downstream parses prose |
| Email | one interface, an SES implementation and a Mailpit one, React Email templates |
| Testing | vitest over the reference slice, the tag resource, the job worker and the request gate, most against a real Postgres |
| API docs | hand-written OpenAPI served at `/v1/api-docs` |

The reference slice is `companies`. Follow it from
`lib/drizzle/schema/companies.ts` through the repository, service and route to
`app/api/v1/companies/route.ts` and its tests.

## Working on it

`CLAUDE.md` holds the conventions. `.claude/skills/` holds these procedures:

- **add-api-resource** — build a new entity end to end
- **write-integration-test** — the test shape, and what to cover
- **db-migration** — the two-database rule and what not to do
- **local-dev-stack** — running, seeding, inspecting, resetting
- **ops-runbook-workflow** — one-off operational tasks against a deployed database

## Commands

```sh
pnpm dev                 # http://localhost:3000
pnpm dev:all             # containers, dev server and worker together
pnpm build

pnpm type-check
pnpm lint
pnpm test:run            # requires .env.test and the test database

pnpm db:generate         # after changing lib/drizzle/schema
pnpm db:migrate:all      # dev and test databases
pnpm db:seed:dev
pnpm db:studio
pnpm db:dbml             # docs/schema.dbml

pnpm dev:email-preview   # then open http://localhost:8026
pnpm dev:reset           # tear down volumes and rebuild from scratch
```

All three of `type-check`, `lint` and `test:run` must pass before a PR. CI runs
the same set.

## Provenance

Extracted from a private working repository so that the code could be read in
public. The extraction left behind the git history, the installed dependencies,
every real environment file and the internal operational notes; the
application, its tests and the conventions it was built under are what remain.
That is why the history here starts at a single commit.

Nothing in it is tied to a particular deployment. The seeded users, the
`example.com` addresses and every value in `.env.example` are fictitious
placeholders.


