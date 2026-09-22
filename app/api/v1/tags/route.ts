import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { canEdit } from "@/lib/helpers/role.helper";
import { getSessionContextWithRole } from "@/lib/helpers/session.helper";
import { tagService } from "@/lib/services/tag.service";
import { createTagSchema, tagQuerySchema } from "@/lib/validations/tag";

// GET /api/v1/tags
export async function GET(request: NextRequest) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    const query = tagQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await tagService.getTags(
      {
        organizationId: sessionContext.organizationId,
        type: query.type,
        keyword: query.keyword,
        includeArchived: query.includeArchived,
      },
      { page: query.page, limit: query.limit },
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/v1/tags
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
          message: "You do not have permission to create tags.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const validated = createTagSchema.parse(body);

    const created = await tagService.createTag({
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
