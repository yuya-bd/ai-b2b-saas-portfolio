import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/lib/constants/app";
import { proxy } from "./proxy";

/**
 * No database and no network: the gate reads a path and a cookie, nothing more.
 *
 * What these defend is the split between the two ways of saying "not signed
 * in". A browser needs the login page. An API client has nowhere to put one,
 * and following the redirect leaves it holding HTML at status 200 — a refusal
 * that reads as a success, which is the failure mode worth a test.
 *
 * The 401 body is asserted literally rather than loosely, because it has to
 * keep matching the one `getSessionContext` returns; a caller should not be
 * able to tell which layer turned it away.
 */

function request(path: string, { signedIn = false } = {}) {
  return new NextRequest(`https://example.com${path}`, {
    headers: signedIn ? { cookie: `${SESSION_COOKIE_NAME}=stub-token` } : {},
  });
}

describe("an API request with no session", () => {
  it("is refused, not redirected", () => {
    const response = proxy(request("/api/v1/companies"));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });

  it("carries the body the route handlers would have returned", async () => {
    const response = proxy(request("/api/v1/companies"));

    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      message: "Sign in to continue.",
    });
  });

  it("names the scheme, so a client knows how to retry", () => {
    const response = proxy(request("/api/v1/companies"));

    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("covers the OpenAPI document, which has no session check of its own", () => {
    const response = proxy(request("/api/v1-docs"));

    expect(response.status).toBe(401);
  });
});

describe("a page request with no session", () => {
  it("is sent to the login page", () => {
    const response = proxy(request("/companies"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
  });

  it("still redirects the browsable docs — a page, despite the name", () => {
    const response = proxy(request("/v1/api-docs"));

    expect(response.status).toBe(307);
  });
});

describe("paths that must never be gated", () => {
  it.each([
    ["the health check", "/api/health"],
    ["Better Auth's own endpoints", "/api/auth/sign-in"],
    ["cron, which authenticates by header", "/api/cron/expire-invitations"],
  ])("lets %s through", (_label, path) => {
    const response = proxy(request(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("with a session cookie", () => {
  it("lets an API request reach its handler", () => {
    const response = proxy(request("/api/v1/companies", { signedIn: true }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("every answer", () => {
  it.each([
    ["a refusal", "/api/v1/companies"],
    ["a redirect", "/companies"],
    ["a pass-through", "/api/health"],
  ])("carries the framing headers on %s", (_label, path) => {
    const response = proxy(request(path));

    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'none'",
    );
  });
});
