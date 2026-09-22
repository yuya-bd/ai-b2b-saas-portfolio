import type { NextRequest } from "next/server";
import { after } from "next/server";
import type { SessionContext } from "@/lib/helpers/session.helper";
import { auditLogService } from "@/lib/services/audit_log.service";
import type { AuditAction, EntityType } from "@/lib/types/audit";

/**
 * Which requests get audited, as one table of URL pattern to action.
 *
 * Keeping it here rather than in each route handler means adding audit
 * coverage for a new endpoint is a single entry, and that it is possible to
 * see at a glance what is and is not covered.
 */

type AuditRouteEntry = {
  action: AuditAction;
  entityType: EntityType | string;
};

type AuditMethodConfig = Partial<
  Record<"POST" | "PATCH" | "PUT" | "DELETE", AuditRouteEntry>
>;

const UUID = "[0-9a-f-]+";
const NANOID = "[A-Za-z0-9_-]+";

/**
 * Evaluated top to bottom; the first matching pattern wins. List more specific
 * paths before the collection they sit under.
 */
const AUDIT_ROUTE_CONFIG: { pattern: RegExp; methods: AuditMethodConfig }[] = [
  {
    // Above the single-company entry, per the rule on ordering. `entityId` is
    // the company the analysis was asked about; the analysis row does not
    // exist yet when this is recorded.
    pattern: new RegExp(`^/api/v1/companies/(${UUID})/analyses$`),
    methods: {
      POST: {
        action: "COMPANY_ANALYSIS_REQUEST",
        entityType: "company_analysis",
      },
    },
  },
  {
    pattern: new RegExp(`^/api/v1/companies/(${UUID})$`),
    methods: {
      PATCH: { action: "COMPANY_UPDATE", entityType: "company" },
      DELETE: { action: "COMPANY_DELETE", entityType: "company" },
    },
  },
  {
    pattern: /^\/api\/v1\/companies$/,
    methods: {
      POST: { action: "COMPANY_CREATE", entityType: "company" },
    },
  },
  {
    pattern: new RegExp(`^/api/v1/tags/(${UUID})$`),
    methods: {
      PATCH: { action: "TAG_UPDATE", entityType: "tag" },
      DELETE: { action: "TAG_DELETE", entityType: "tag" },
    },
  },
  {
    pattern: /^\/api\/v1\/tags$/,
    methods: {
      POST: { action: "TAG_CREATE", entityType: "tag" },
    },
  },
  {
    pattern: new RegExp(`^/api/v1/members/(${NANOID})$`),
    methods: {
      PATCH: { action: "MEMBER_UPDATE", entityType: "member" },
      DELETE: { action: "MEMBER_DELETE", entityType: "member" },
    },
  },
];

type ResolvedAudit = AuditRouteEntry & { entityId?: string };

function resolveAuditConfig(
  pathname: string,
  method: string,
): ResolvedAudit | null {
  for (const route of AUDIT_ROUTE_CONFIG) {
    const match = pathname.match(route.pattern);
    if (!match) continue;

    const config = route.methods[method as keyof AuditMethodConfig];
    if (!config) return null;

    return { ...config, entityId: match[1] || undefined };
  }
  return null;
}

function extractIpAddress(request: NextRequest): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

/**
 * Queue an audit write for this request.
 *
 * Called from the session helpers, so route handlers never call it directly.
 * The write runs inside `after()`, which fires once the response has been
 * sent — auditing therefore costs the caller no latency, and a failure to
 * write cannot fail the request.
 */
export function scheduleAuditLog(
  request: NextRequest,
  session: SessionContext,
): void {
  const pathname = request.nextUrl?.pathname;
  if (!pathname) return;

  const auditConfig = resolveAuditConfig(pathname, request.method);
  if (!auditConfig) return;

  const ipAddress = extractIpAddress(request);

  /**
   * Returned, not merely called. `after` waits on a promise the callback hands
   * back and drops one it never sees, so without the return the insert races
   * the end of the request: it lands, or it does not, and nothing reports
   * which. `record` swallows its own failures, so returning it cannot turn an
   * audit problem into a failed request.
   */
  after(() =>
    auditLogService.record({
      organizationId: session.organizationId,
      userId: session.userId,
      action: auditConfig.action,
      entityType: auditConfig.entityType,
      entityId: auditConfig.entityId,
      ipAddress,
    }),
  );
}
