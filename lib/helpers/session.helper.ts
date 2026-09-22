import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants/app";
import type { Role } from "@/lib/constants/roles";
import { scheduleAuditLog } from "@/lib/helpers/audit.helper";
import { isPartnerMember } from "@/lib/helpers/role.helper";
import { memberRepository } from "@/lib/repositories/auth/member.repository";
import { sessionRepository } from "@/lib/repositories/auth/session.repository";

export interface GetSessionWithRoleOptions {
  /**
   * Let partner members through.
   *
   * Defaults to false, so a route has to opt in deliberately. A route added
   * without thinking about partners denies them, which is the safe direction
   * for the mistake to fall.
   */
  allowPartner?: boolean;
}

/** Who is calling, and which organization they are calling as. */
export interface SessionContext {
  userId: string;
  organizationId: string;
  sessionId: string;
}

export interface SessionContextWithRole extends SessionContext {
  role: Role;
  memberId: string;
  departmentId: string | null;
}

/**
 * Resolve the caller's session.
 *
 * Returns either a context or the NextResponse to send back, so a route
 * handler's first line reads: get it, and if it is a response, return it.
 */
export async function getSessionContext(
  request: NextRequest,
): Promise<SessionContext | NextResponse> {
  // Cheap rejection before doing any signature verification or database work.
  const cookies = request.headers.get("cookie") || "";
  const hasSessionCookie = cookies.includes(`${SESSION_COOKIE_NAME}=`);

  if (!hasSessionCookie) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Sign in to continue." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  // Full verification, signature included.
  const verified = await auth.api.getSession({ headers: request.headers });

  if (!verified) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Your session is no longer valid." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  // Better Auth's session type does not include the custom
  // activeOrganizationId column, so the row is read directly.
  const session = await sessionRepository.findByToken(verified.session.token);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Your session is no longer valid." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  if (!session.activeOrganizationId) {
    return NextResponse.json(
      {
        error: "No Active Organization",
        message: "Select an organization to continue.",
      },
      { status: 400 },
    );
  }

  return {
    organizationId: session.activeOrganizationId,
    userId: session.userId,
    sessionId: session.id,
  };
}

/**
 * Resolve the caller's session along with their role in the active
 * organization. Use this in any route that makes an authorization decision.
 */
export async function getSessionContextWithRole(
  request: NextRequest,
  options: GetSessionWithRoleOptions = {},
): Promise<SessionContextWithRole | NextResponse> {
  const sessionContext = await getSessionContext(request);

  if (sessionContext instanceof NextResponse) {
    return sessionContext;
  }

  const member = await memberRepository.findByUserAndOrganization(
    sessionContext.userId,
    sessionContext.organizationId,
  );

  if (!member) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You are not a member of this organization.",
      },
      { status: 403 },
    );
  }

  if (!options.allowPartner && isPartnerMember(member.role)) {
    return NextResponse.json(
      { error: "Forbidden", message: "You cannot access this resource." },
      { status: 403 },
    );
  }

  const result: SessionContextWithRole = {
    ...sessionContext,
    role: member.role,
    memberId: member.id,
    departmentId: member.departmentId,
  };

  // Audit writes happen here rather than in each route, so a route cannot be
  // written that quietly skips them.
  scheduleAuditLog(request, result);

  return result;
}
