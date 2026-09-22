import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { canEdit } from "@/lib/helpers/role.helper";
import { getSessionContextWithRole } from "@/lib/helpers/session.helper";
import { companyService } from "@/lib/services/company.service";
import {
  companyQuerySchema,
  createCompanySchema,
} from "@/lib/validations/company";

/**
 * Route handlers stay thin on purpose. Each one does the same four things and
 * nothing else:
 *
 *   1. resolve the session (and bail if it returned a response)
 *   2. check the role
 *   3. parse and validate input
 *   4. call the service, and let handleApiError deal with anything thrown
 *
 * Business rules live in the service, queries in the repository.
 */

// GET /api/v1/companies
export async function GET(request: NextRequest) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    const query = companyQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await companyService.getCompanies(
      {
        // From the session, never from the query string.
        organizationId: sessionContext.organizationId,
        keyword: query.keyword,
        country: query.country,
        departmentId: query.departmentId,
        status: query.status,
        includeArchived: query.includeArchived,
      },
      { page: query.page, limit: query.limit },
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/v1/companies
export async function POST(request: NextRequest) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    if (!canEdit(sessionContext.role)) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have permission to create companies.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validated = createCompanySchema.parse(body);

    const created = await companyService.createCompany({
      ...validated,
      organizationId: sessionContext.organizationId,
      createdBy: sessionContext.userId,
      updatedBy: sessionContext.userId,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
