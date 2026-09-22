# saas-foundation

[![Test](https://github.com/yuya-bd/ai-b2b-saas-portfolio/actions/workflows/test.yml/badge.svg)](https://github.com/yuya-bd/ai-b2b-saas-portfolio/actions/workflows/test.yml)

> **Portfolio Edition.** This is a reference implementation, built to
> demonstrate architecture and engineering patterns used in real production
> work. Real customer data and business-critical logic are not included.
> See ["Security & Confidentiality"](#security--confidentiality) below for
> details.

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

## Design decisions: asynchronous AI processing

The company-analysis feature is a small case study in running a paid,
non-deterministic API from a multi-tenant queue safely.

**Idempotency is two layers, not one.** `jobRepository.claimForProcessing` is
a conditional `UPDATE ... WHERE status IN (...)` — a compare-and-set that lets
exactly one worker win a race for the same job id, and lets a duplicate
delivery of already-completed work match nothing and return before any
provider call is made. Behind that, `company_analyses` carries a `UNIQUE`
constraint on `jobId`; `createIfAbsent` inserts with `ON CONFLICT DO NOTHING`
and a losing writer reads back the winner's row instead of erroring. Two
independent guards, because a crash between "claimed" and "wrote the result"
is the window the first layer alone cannot close.

**The model's answer is a schema, not prose.** The Anthropic provider passes
`companyAnalysisResultSchema` through `zodOutputFormat`; the SDK parses the
response against it, and `parsed_output` is either the typed object or
`null`. A `stop_reason: "refusal"` — the model's safety decline, which
arrives as an ordinary 200 — is checked first, so it never surfaces as a
confusing schema failure.

**Retries happen once, not twice.** The Anthropic SDK already retries
408/409/429/5xx with backoff. On top of that, `AiProviderError.retryable` is
the one question the worker asks about a failure that survives those
retries: could running the job again ever succeed? Bad credentials, a
malformed request, or output that doesn't fit the schema are permanent —
recorded as `FAILED` and left for a human, because retrying a metered API
call that fails identically every time is an unbounded bill, not resilience.
Only retryable failures are re-thrown, so the queue message stays for
redelivery.

**Only six fields ever leave the database for the model.** `toCompanyFacts`
in `lib/services/company_analysis.service.ts` builds the provider request
field by field rather than spreading the company row, so a new column added
to `companies` does not silently start showing up in a prompt.

**The prompt treats company data as data, not instruction.** `description`
is free text a tenant's own users write, and it ends up inside the prompt
sent to the model — the classic injection surface. The facts travel as a
fenced JSON block under a heading that names them as data, and the system
prompt (`lib/ai/analysis-prompt.ts`) tells the model outright to ignore
anything inside that block that reads like an instruction. Neither is a
guarantee on its own, which is why the response is also schema-constrained
on the way out: the worst case is a wrong summary, not an arbitrarily-shaped
one.

**Nothing that reaches a log line can leak a prompt or a key.**
`describeError` (`lib/ai/errors.ts`) is the only thing allowed to touch a
provider error on the way to `console.error` — it writes the error's class
name, this codebase's own error code, and an HTTP status if the SDK
supplied one, and discards everything else, because a provider SDK's
`error.message` can carry the request that produced it. The API key is
never read outside the SDK: `hasAnthropicApiKey()` reports whether it is
set, and nothing in this codebase ever holds the value itself.

## Provenance

A reference implementation distilled from patterns used in real production
B2B SaaS work. What remains here is the application, its tests and the
conventions it was built under; internal operational notes, real
environment files and anything tied to a specific deployment were left
out — which is why the history here starts at a single commit.

Nothing in it is tied to a particular deployment. The seeded users, the
`example.com` addresses and every value in `.env.example` are fictitious
placeholders.

## Security & Confidentiality

Not included: the client's identity, real customer and company records,
real API keys and database credentials, cloud account identifiers, and
internal domain names and operational notes. Everything visible here is
fictitious rather than redacted — the seeded users, the `example.com`
addresses, and every value in `.env.example` and `.env.test.example` were
written as placeholders, not blanked out from real ones. The one hard-coded
account id in the codebase, `000000000000` in `lib/queue/sqs-client.ts`, is
ElasticMQ's own placeholder for local development, not a real AWS account.

`companies` and `company_analyses`, and the AI pipeline that reads from them,
are the closest thing here to real business logic. The allow-list in
`toCompanyFacts` and the tenant-scoped repository pattern used throughout
(see "Design decisions" above) are what stand in for the parts of the
original system that are not reproduced.

## License

MIT — see [LICENSE](LICENSE).


