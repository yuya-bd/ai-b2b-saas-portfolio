import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "@/app/api/v1/companies/[id]/route";
import { ROLES } from "@/lib/constants/roles";
import {
  buildAuthenticatedRequest,
  createTestCompany,
  createTestContext,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

const URL_BASE = "http://localhost:3000/api/v1/companies";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

function asUser(sessionToken: string) {
  mockGetSession.mockResolvedValue({ session: { token: sessionToken } });
}

/** Route params are a promise in the App Router. */
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/companies/[id]", () => {
  let admin: TestContext;
  let viewer: TestContext;
  let otherOrg: TestContext;

  beforeAll(async () => {
    admin = await createTestContext({ role: ROLES.ADMIN });
    viewer = await createTestContext({ role: ROLES.VIEWER });
    otherOrg = await createTestContext({ role: ROLES.ADMIN });
  });

  afterAll(async () => {
    await cleanupOrganization(admin.organizationId);
    await cleanupOrganization(viewer.organizationId);
    await cleanupOrganization(otherOrg.organizationId);
  });

  describe("GET", () => {
    it("returns the company", async () => {
      const id = await createTestCompany({
        organizationId: admin.organizationId,
        name: "Detail Co",
      });
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken),
        params(id),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.name).toBe("Detail Co");
    });

    it("returns 404 for an unknown id", async () => {
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(
          `${URL_BASE}/${UNKNOWN_ID}`,
          admin.sessionToken,
        ),
        params(UNKNOWN_ID),
      );

      expect(response.status).toBe(404);
    });

    it("returns 404, not 403, for a company in another organization", async () => {
      const id = await createTestCompany({
        organizationId: otherOrg.organizationId,
        name: "Someone else's",
      });
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken),
        params(id),
      );

      // 404 rather than 403 on purpose: 403 would confirm the id exists.
      expect(response.status).toBe(404);
    });

    it("returns 400 for an id that is not a UUID", async () => {
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(`${URL_BASE}/not-a-uuid`, admin.sessionToken),
        params("not-a-uuid"),
      );

      expect(response.status).toBe(400);
    });

    it("returns 401 without a session", async () => {
      const response = await GET(
        buildAuthenticatedRequest(`${URL_BASE}/${UNKNOWN_ID}`, null),
        params(UNKNOWN_ID),
      );

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH", () => {
    it("updates the company", async () => {
      const id = await createTestCompany({
        organizationId: admin.organizationId,
        name: "Before patch",
      });
      asUser(admin.sessionToken);

      const response = await PATCH(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken, {
          method: "PATCH",
          body: JSON.stringify({ name: "After patch" }),
        }),
        params(id),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.name).toBe("After patch");
      expect(body.updatedBy).toBe(admin.userId);
    });

    it("returns 403 for a viewer", async () => {
      const id = await createTestCompany({
        organizationId: viewer.organizationId,
        name: "Read only",
      });
      asUser(viewer.sessionToken);

      const response = await PATCH(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, viewer.sessionToken, {
          method: "PATCH",
          body: JSON.stringify({ name: "Nope" }),
        }),
        params(id),
      );

      expect(response.status).toBe(403);
    });

    it("cannot update across organizations", async () => {
      const id = await createTestCompany({
        organizationId: otherOrg.organizationId,
        name: "Untouchable",
      });
      asUser(admin.sessionToken);

      const response = await PATCH(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken, {
          method: "PATCH",
          body: JSON.stringify({ name: "Hijacked" }),
        }),
        params(id),
      );

      expect(response.status).toBe(404);
    });

    it("returns 400 for an invalid field value", async () => {
      const id = await createTestCompany({
        organizationId: admin.organizationId,
        name: "Validated",
      });
      asUser(admin.sessionToken);

      const response = await PATCH(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken, {
          method: "PATCH",
          body: JSON.stringify({ website: "not-a-url" }),
        }),
        params(id),
      );

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE", () => {
    it("deletes the company and returns 204", async () => {
      const id = await createTestCompany({
        organizationId: admin.organizationId,
        name: "Deletable",
      });
      asUser(admin.sessionToken);

      const response = await DELETE(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken, {
          method: "DELETE",
        }),
        params(id),
      );

      expect(response.status).toBe(204);

      const after = await GET(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, admin.sessionToken),
        params(id),
      );
      expect(after.status).toBe(404);
    });

    it("returns 403 for a viewer", async () => {
      const id = await createTestCompany({
        organizationId: viewer.organizationId,
        name: "Survives",
      });
      asUser(viewer.sessionToken);

      const response = await DELETE(
        buildAuthenticatedRequest(`${URL_BASE}/${id}`, viewer.sessionToken, {
          method: "DELETE",
        }),
        params(id),
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for an unknown id", async () => {
      asUser(admin.sessionToken);

      const response = await DELETE(
        buildAuthenticatedRequest(
          `${URL_BASE}/${UNKNOWN_ID}`,
          admin.sessionToken,
          { method: "DELETE" },
        ),
        params(UNKNOWN_ID),
      );

      expect(response.status).toBe(404);
    });
  });
});
