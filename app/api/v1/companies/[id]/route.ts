import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { canEdit } from "@/lib/helpers/role.helper";
import { getSessionContextWithRole } from "@/lib/helpers/session.helper";
import { companyService } from "@/lib/services/company.service";
import { updateCompanySchema } from "@/lib/validations/company";

/** Route params are a promise in the App Router. */
type RouteContext = { params: Promise<{ id: string }> };

// GET /api/v1/companies/[id]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    const { id } = await context.params;
    const company = await companyService.getCompanyById(
      id,
      sessionContext.organizationId,
    );

    return NextResponse.json(company);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/v1/companies/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    if (!canEdit(sessionContext.role)) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have permission to update companies.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const validated = updateCompanySchema.parse(body);

    const updated = await companyService.updateCompany(
      id,
      sessionContext.organizationId,
      { ...validated, updatedBy: sessionContext.userId },
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/v1/companies/[id]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    if (!canEdit(sessionContext.role)) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have permission to delete companies.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    await companyService.deleteCompany(id, sessionContext.organizationId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
