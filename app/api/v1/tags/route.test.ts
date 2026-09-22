import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/tags/route";
import { ROLES } from "@/lib/constants/roles";
import {
  buildAuthenticatedRequest,
  createTestContext,
  createTestTag,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

const URL_BASE = "http://localhost:3000/api/v1/tags";

function asUser(sessionToken: string) {
  mockGetSession.mockResolvedValue({ session: { token: sessionToken } });
}

describe("/api/v1/tags", () => {
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
      expect(
        (await GET(buildAuthenticatedRequest(URL_BASE, null))).status,
      ).toBe(401);
    });

    it("returns 401 when the cookie does not match a session", async () => {
      mockGetSession.mockResolvedValue(null);

      expect(
        (await GET(buildAuthenticatedRequest(URL_BASE, "not-a-real-token")))
          .status,
      ).toBe(401);
    });

    it("returns 403 for a partner member", async () => {
      asUser(partner.sessionToken);

      expect(
        (await GET(buildAuthenticatedRequest(URL_BASE, partner.sessionToken)))
          .status,
      ).toBe(403);
    });

    it("lists tags for the caller's organization only", async () => {
      await createTestTag({
        organizationId: admin.organizationId,
        name: "Listed Tag",
      });
      await createTestTag({
        organizationId: viewer.organizationId,
        name: "Other Org Tag",
      });
      asUser(admin.sessionToken);

      const response = await GET(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(
        body.data.some((t: { name: string }) => t.name === "Listed Tag"),
      ).toBe(true);
      expect(
        body.data.some((t: { name: string }) => t.name === "Other Org Tag"),
      ).toBe(false);
    });

    it("returns 400 for an invalid query parameter", async () => {
      asUser(admin.sessionToken);

      expect(
        (
          await GET(
            buildAuthenticatedRequest(`${URL_BASE}?page=0`, admin.sessionToken),
          )
        ).status,
      ).toBe(400);
    });

    it("allows a viewer to read", async () => {
      asUser(viewer.sessionToken);

      expect(
        (await GET(buildAuthenticatedRequest(URL_BASE, viewer.sessionToken)))
          .status,
      ).toBe(200);
    });
  });

  describe("POST", () => {
    it("creates a tag and stamps the acting user", async () => {
      asUser(admin.sessionToken);

      const response = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: JSON.stringify({ type: "category", name: "Created via API" }),
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.organizationId).toBe(admin.organizationId);
      expect(body.createdBy).toBe(admin.userId);
    });

    it("returns 403 for a viewer", async () => {
      asUser(viewer.sessionToken);

      expect(
        (
          await POST(
            buildAuthenticatedRequest(URL_BASE, viewer.sessionToken, {
              method: "POST",
              body: JSON.stringify({ type: "category", name: "Nope" }),
            }),
          )
        ).status,
      ).toBe(403);
    });

    it("returns 400 when required fields are missing", async () => {
      asUser(admin.sessionToken);

      expect(
        (
          await POST(
            buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
              method: "POST",
              body: JSON.stringify({ type: "category" }),
            }),
          )
        ).status,
      ).toBe(400);
    });

    it("returns 400 for a malformed body", async () => {
      asUser(admin.sessionToken);

      expect(
        (
          await POST(
            buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
              method: "POST",
              body: "{ not json",
            }),
          )
        ).status,
      ).toBe(400);
    });

    it("returns 409 on a duplicate type and name", async () => {
      asUser(admin.sessionToken);
      const payload = JSON.stringify({
        type: "duplicate-probe",
        name: "Same",
      });

      const first = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: payload,
        }),
      );
      expect(first.status).toBe(201);

      const second = await POST(
        buildAuthenticatedRequest(URL_BASE, admin.sessionToken, {
          method: "POST",
          body: payload,
        }),
      );
      expect(second.status).toBe(409);
    });
  });
});
