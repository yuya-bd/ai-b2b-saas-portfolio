# saas-foundation

Reference foundation for **multi-tenant B2B applications**: Next.js App Router, Drizzle, Better Auth, Postgres. One worked vertical slice (`companies`) shows the pattern; new resources are built the same way.

## Commands

```sh
pnpm install
docker compose up -d --wait   # postgres 5433, redis 6380, elasticmq 9326, mailpit 8026
pnpm db:migrate               # local dev DB
pnpm db:test:migrate          # test DB — a separate step, easy to forget
pnpm db:seed:dev              # one user per role, password `password1234`
pnpm dev                      # http://localhost:3000
pnpm type-check && pnpm lint && pnpm test:run   # all three MUST pass before a PR
```

## Structure

- `app/api/v1/*/route.ts` — thin handlers: resolve session → check role → validate → call service → `handleApiError`
- `lib/services/*.service.ts` — business rules; throws domain errors from `lib/api/errors.ts`
- `lib/repositories/*.repository.ts` — queries only; no authorization, no cache invalidation
- `lib/drizzle/schema/` — tables; `auth/` holds the Better Auth set
- `lib/helpers/` — `session.helper.ts` (who is calling), `role.helper.ts` (may they), `audit.helper.ts` (record it)
- `app/(app)/**/page.tsx` — thin shells delegating to `src/features/`
- Tests sit next to what they test, as `*.test.ts`

## Conventions

- **Tenant scope comes from the session, never from the client.** `organizationId` is read off `SessionContextWithRole`; no schema in `lib/validations/` accepts it. Repository filters take it as a required field so an unscoped query does not compile.
- **A resource is one slice.** schema → migration → validation → repository → service → route → tests → OpenAPI entry. Use the `add-api-resource` skill; it walks the whole slice.
- **Deny by default.** New routes are private unless added to `PUBLIC_PAGE_PREFIXES` in `proxy.ts`, and `partner_member` is refused unless the route passes `allowPartner: true`.
- **Errors carry their status.** Extend `AppError`; never add a case to `handleApiError`. Its message reaches the client, so keep internals out of it.
- **Tests use a real Postgres.** Each file works in its own organization via `createTestContext()` and cleans up with `cleanupOrganization()`. Never call `cleanupDatabase()` from a test — it truncates everything and files run in parallel.
- **Migrations: `pnpm db:generate` only.** Do not chain lint over the whole repo; format just the files you changed. Local databases use `db:migrate`; only CI uses `push --force`.
- **Better Auth owns its own tables.** Custom session columns must be declared in `session.additionalFields` or they are silently dropped on write. Never hand-write account rows — go through its API, as `db/seed.ts` does.
- **Git**: branch, then PR against `main`. Commit style `<type>: <summary>`, one line.
