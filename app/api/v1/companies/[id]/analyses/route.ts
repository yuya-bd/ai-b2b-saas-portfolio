import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { canEdit } from "@/lib/helpers/role.helper";
import { getSessionContextWithRole } from "@/lib/helpers/session.helper";
import { companyAnalysisService } from "@/lib/services/company_analysis.service";
import { requestCompanyAnalysisSchema } from "@/lib/validations/company-analysis";

/** Route params are a promise in the App Router. */
type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/companies/[id]/analyses
 *
 * The analyses already produced for one company, newest first. A read, so no
 * role check beyond holding a session.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    const { id } = await context.params;
    const analyses = await companyAnalysisService.getAnalyses({
      organizationId: sessionContext.organizationId,
      companyId: id,
    });

    return NextResponse.json({ data: analyses });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/companies/[id]/analyses
 *
 * Queues an analysis and returns 202 with the job id — the work has been
 * accepted, not done. Poll the job, or read this collection once it reports
 * COMPLETED.
 *
 * Gated on `canEdit` rather than on a read permission: each call spends money
 * at a metered provider and writes a row, so `viewer` is the wrong side of
 * this line even though the result is something a viewer may read.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    if (!canEdit(sessionContext.role)) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have permission to request an analysis.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const validated = requestCompanyAnalysisSchema.parse(body);

    const job = await companyAnalysisService.requestAnalysis({
      organizationId: sessionContext.organizationId,
      companyId: id,
      question: validated.question,
    });

    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
