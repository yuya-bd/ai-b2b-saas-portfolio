---
name: add-api-resource
description: Add a complete API resource to this codebase — schema, migration, validation, repository, service, route handlers, tests, and OpenAPI entry. Use when asked to add a new entity, table, or CRUD endpoint (e.g. "add tags", "add a projects resource", "create an API for X").
---

# Add an API resource

Build one entity end to end. Every existing resource follows this shape, so
copying `companies` and renaming is faster and safer than writing from scratch.

Read these three first — they are the reference implementation:

- `lib/repositories/company.repository.ts`
- `lib/services/company.service.ts`
- `app/api/v1/companies/route.ts`

## Before starting

Settle two things, and ask if they are not obvious from the request:

1. **Is it department-scoped?** If members below `admin` should only reach
   their own department's rows, the table needs `departmentId` and the filter
   needs to honour it. If not, leave it out.
2. **What makes a row unique?** Uniqueness is almost always *per organization*,
   not global — two tenants may legitimately hold the same record.

## Steps

Work in this order. Each step compiles on its own, so a mistake surfaces
immediately rather than three files later.

### 1. Schema — `lib/drizzle/schema/<plural>.ts`

Spread `baseColumns` (uuid id, timestamps) and, if rows are user-edited,
`actorColumns` (createdBy/updatedBy). Then:

```ts
import { boolean, index, pgTable, text, unique, varchar } from "drizzle-orm/pg-core";
import { organization } from "./auth/organization";
import { actorColumns, baseColumns } from "./columns";

export const things = pgTable(
  "things",
  {
    ...baseColumns,
    ...actorColumns,
    // Required on every business table. text, not uuid — Better Auth
    // generates string ids and the foreign key has to match.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: varchar("name", { length: 255 }).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
  },
  (table) => [
    index("idx_things_organization_id").on(table.organizationId),
    unique("uniq_things_org_name").on(table.organizationId, table.name),
  ],
);
```

Index every column that is filtered or sorted on. Scope uniqueness to the
organization, never globally.

Export it from `lib/drizzle/schema/index.ts`.

### 2. Migration

```sh
pnpm db:generate      # drizzle-kit generate — nothing else
pnpm db:migrate       # dev DB
pnpm db:test:migrate  # test DB — separate, and easy to forget
```

Do not chain lint across the repo here. See the `db-migration` skill.

### 3. Validation — `lib/validations/<singular>.ts`

Three schemas: `create<X>Schema`, `update<X>Schema` (the create schema
`.partial()`), and `<x>QuerySchema`.

**`organizationId` must not appear in any of them.** It comes from the
session. Accepting it from the client is a tenant-isolation hole.

Query parameters arrive as strings — use `z.coerce` for numbers and a
`.transform()` for booleans. Cap `limit` with `.max()`.

### 4. Repository — `lib/repositories/<singular>.repository.ts`

Export the entity types off `$inferSelect` / `$inferInsert`, then an interface
and its implementation, then a singleton instance at the bottom.

- The filter type takes `organizationId: string` — **required, not optional**, so an unscoped query fails to compile
- `findById(id, organizationId)` — both, always; id alone would read across tenants
- `update` and `delete` take `organizationId` too, and return `undefined` when nothing matched
- a private `buildWhere(filter)` shared by `findMany` and `count`, so a page and its total can never disagree
- queries only: no role checks, no cache invalidation, no notifications

### 5. Service — `lib/services/<singular>.service.ts`

Takes the repository through its constructor, defaulting to the singleton.

- throw `NotFoundError` from `lib/api/errors.ts` rather than returning `undefined`
- call the matching `invalidate<X>ByOrganization` after every write
- add an invalidation helper to `lib/cache/invalidation.ts` and a key to `CacheKey` in `lib/cache/index.ts` if the resource is cached

### 6. Routes — `app/api/v1/<plural>/route.ts` and `[id]/route.ts`

Every handler is the same four steps and nothing more:

```ts
const sessionContext = await getSessionContextWithRole(request);
if (sessionContext instanceof NextResponse) return sessionContext;   // 1
if (!canEdit(sessionContext.role)) return /* 403 */;                  // 2
const validated = createXSchema.parse(await request.json());          // 3
return NextResponse.json(await xService.create({                      // 4
  ...validated,
  organizationId: sessionContext.organizationId,
  createdBy: sessionContext.userId,
}), { status: 201 });
```

Wrap the body in `try/catch` and return `handleApiError(error)`.

- reads need no role check beyond the session; writes need `canEdit`
- pass `{ allowPartner: true }` only when partners are meant to reach it
- `[id]` route params are a promise: `const { id } = await context.params`
- DELETE returns 204 with a null body

### 7. Audit — `lib/helpers/audit.helper.ts`

Add an entry to `AUDIT_ROUTE_CONFIG` and the action names to
`lib/types/audit.ts`. More specific paths go above the collection they sit
under; the first match wins.

### 8. Test fixtures — `lib/test/`

Two edits that are easy to miss, and whose absence shows up much later:

- `factories.ts` — add `createTest<X>()`, generating any unique value per call
- `helpers.ts` — add the table to **both** `cleanupOrganization()` (children
  before parents) and the `TRUNCATE` list in `cleanupDatabase()`

Skip the `helpers.ts` edit and rows survive between test files, so a count
assertion passes alone and fails in a full run.

### 9. Tests

Three files, colocated. See the `write-integration-test` skill for the shape.
The cases that matter most are the isolation ones — a second organization must
not be readable, updatable, or deletable.

### 10. OpenAPI — `lib/openapi/spec-v1.ts`

Add the schema to `components.schemas` and the paths. Hand-written on purpose:
it is the contract, so a breaking change should be something someone types.

## Finish

```sh
pnpm type-check && pnpm lint && pnpm test:run
```

All three must pass. If tests fail on a missing table, step 2's
`db:test:migrate` was skipped.
