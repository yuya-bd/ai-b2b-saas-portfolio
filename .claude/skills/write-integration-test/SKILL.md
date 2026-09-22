---
name: write-integration-test
description: Write tests for this codebase — repository, service, and route-handler tests that run against a real Postgres with vitest. Use when adding or fixing tests, when a test is flaky, or when asked how testing works here.
---

# Write a test

Tests here are integration tests. They open a real Postgres connection and
exercise real SQL. Constraints, cascades and dialect behaviour are the point —
a mocked database would only assert that the mock was called.

Reference implementations:

- `lib/repositories/company.repository.test.ts` — data access
- `lib/services/company.service.test.ts` — business rules
- `app/api/v1/companies/route.test.ts` — auth, roles, HTTP status codes

## Isolation

`fileParallelism` is on, so test files run in separate processes against one
database at the same time.

**Each file works inside its own organization.** `createTestContext()` builds a
fresh tenant, organization, department, user, member and session, all with
generated ids. Nothing is shared, so no file can disturb another.

```ts
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ role: ROLES.ADMIN });
});

afterAll(async () => {
  await cleanupOrganization(ctx.organizationId);
});
```

**Never call `cleanupDatabase()` from a test.** It truncates every table and
would delete whatever the other files are working on. It exists for a global
teardown or a manual reset.

## Setup that is already handled

`lib/test/setup.ts` loads `.env.test`, forces `USE_MOCK_SQS=true`, and replaces
`next/server`'s `after()` with a synchronous call. That last one matters: the
real `after()` needs a request scope and throws outside one, so every route
test would fail on the audit write. Running it synchronously means audit
behaviour is testable rather than invisible.

`.env.test` deliberately leaves `REDIS_URL` unset, so tests exercise the
no-cache path and one test's result can never depend on another's cached value.

## Testing a route handler

Better Auth verifies a signed cookie that a test cannot forge. Mock **only**
that step — the session row, member row, role check and queries all stay real:

```ts
const mockGetSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

function asUser(sessionToken: string) {
  mockGetSession.mockResolvedValue({ session: { token: sessionToken } });
}
```

Build requests with `buildAuthenticatedRequest(url, sessionToken, init)`. It
returns a real `NextRequest`, because handlers read `nextUrl` and `cookies`.

For a `[id]` route, params are a promise:

```ts
await GET(request, { params: Promise.resolve({ id }) });
```

## What to cover

Beyond the happy path, these are the cases that catch real defects:

| Case | Expected |
|---|---|
| No session cookie | 401 |
| Cookie present, session invalid | 401 |
| Partner member, route not opted in | 403 |
| Viewer attempting a write | 403 |
| Record belonging to another organization | **404**, not 403 |
| `organizationId` passed in the query string | ignored |
| Missing required field | 400 |
| Malformed JSON body | 400 |
| Duplicate unique value | 409 |
| Unknown id | 404 |

The other-organization case returning 404 rather than 403 is deliberate: 403
would confirm the id exists.

## Running

```sh
pnpm test:run                 # everything
pnpm test:run path/to/file    # one file
pnpm test                     # watch
```

`relation "..." does not exist` means the test database is behind. Run
`pnpm db:test:migrate` — it is a separate step from `db:migrate`.
