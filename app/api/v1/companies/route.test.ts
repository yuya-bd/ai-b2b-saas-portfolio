import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/companies/route";
import { ROLES } from "@/lib/constants/roles";
import {
  buildAuthenticatedRequest,
  createTestCompany,
  createTestContext,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

/**
 * Better Auth verifies a signed cookie, which a test cannot forge. Only that
 * verification step is mocked; everything downstream — the session row, the
 * member row, the role check, the queries — is real, so these tests still
 * cover the authorization path rather than skipping past it.
 */
const mockGetSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

const URL_BASE = "http://localhost:3000/api/v1/companies";

/** Point the mock at a real session row. */
function asUser(sessionToken: string) {
  mockGetSession.mockResolvedValue({ session: { token: sessionToken } });
}

describe("/api/v1/companies", () => {
  let admin: TestContext;
  let viewer: TestContext;
  let partner: TestContext;

  beforeAll(async () => {
    admin = await createTestContext({ role: ROLES.ADMIN });
    viewer = await createTestContext({ role: ROLES.VIEWER });
    partner = await createTestContext({ role: ROLES.PARTNER_MEMBER });
  });

  afterAll(async () => {
    await cleanupOrganization(admin.organizationId);
    await cleanupOrganization(viewer.organizationId);
    await cleanupOrganization(partner.organizationId);
  });

  describe("GET", () => {
    it("returns 401 without a session cookie", async () => {
      const response = await GET(buildAuthenticatedRequest(URL_BASE, null));

      expect(response.status).toBe(401);
    });

    it("returns 401 when the cookie does not match a session", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await GET(
        buildAuthenticatedRequest(URL_BASE, "not-a-real-token"),
      );

      expect(response.status).toBe(401);
    });

    it("returns 403 for a partner member, who is denied by default", async () => {
      asUser(partner.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(URL_BASE, partner.sessionToken),
      );

      expect(response.status).toBe(403);
    });

    it("lists companies for the caller's organization", async () => {
      await createTestCompany({
        organizationId: admin.organizationId,
        name: "Listed Co",
      });
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(
        body.data.some((c: { name: string }) => c.name === "Listed Co"),
      ).toBe(true);
      expect(body.pagination).toBeDefined();
    });

    it("ignores an organizationId supplied in the query string", async () => {
      await createTestCompany({
        organizationId: viewer.organizationId,
        name: "Other Org Co",
      });
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(
          `${URL_BASE}?organizationId=${viewer.organizationId}`,
          admin.sessionToken,
        ),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(
        body.data.some((c: { name: string }) => c.name === "Other Org Co"),
      ).toBe(false);
    });

    it("returns 400 for an invalid query parameter", async () => {
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(`${URL_BASE}?page=-1`, admin.sessionToken),
      );

      expect(response.status).toBe(400);
    });

    it("allows a viewer to read", async () => {
      asUser(viewer.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(URL_BASE, viewer.sessionToken),
      );

      expect(response.status).toBe(200);
    });
  });

  describe("POST", () => {
    it("creates a company and stamps the acting user", async () => {
      asUser(admin.sessionToken);

      const response = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: JSON.stringify({ name: "Created via API", country: "JP" }),
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.name).toBe("Created via API");
      expect(body.organizationId).toBe(admin.organizationId);
      expect(body.createdBy).toBe(admin.userId);
    });

    it("returns 403 for a viewer, who cannot write", async () => {
      asUser(viewer.sessionToken);

      const response = await POST(
        buildAuthenticatedRequest(URL_BASE, viewer.sessionToken, {
          method: "POST",
          body: JSON.stringify({ name: "Should not exist" }),
        }),
      );

      expect(response.status).toBe(403);
    });

    it("returns 400 when required fields are missing", async () => {
      asUser(admin.sessionToken);

      const response = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: JSON.stringify({ country: "JP" }),
        }),
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 for a malformed body", async () => {
      asUser(admin.sessionToken);

      const response = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: "{ not json",
        }),
      );

      expect(response.status).toBe(400);
    });

    it("returns 409 on a duplicate registration number", async () => {
      asUser(admin.sessionToken);
      const registrationNumber = `route-dup-${Date.now()}`;

      const first = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: JSON.stringify({ name: "First", registrationNumber }),
        }),
      );
      expect(first.status).toBe(201);

      const second = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: JSON.stringify({ name: "Second", registrationNumber }),
        }),
      );

      expect(second.status).toBe(409);
    });
  });
});
