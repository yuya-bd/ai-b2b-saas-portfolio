import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { canEdit } from "@/lib/helpers/role.helper";
import { getSessionContextWithRole } from "@/lib/helpers/session.helper";
import { tagService } from "@/lib/services/tag.service";
import { updateTagSchema } from "@/lib/validations/tag";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/v1/tags/[id]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const sessionContext = await getSessionContextWithRole(request);
    if (sessionContext instanceof NextResponse) {
      return sessionContext;
    }

    const { id } = await context.params;
    const tag = await tagService.getTagById(id, sessionContext.organizationId);

    return NextResponse.json(tag);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/v1/tags/[id]
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
          message: "You do not have permission to update tags.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const validated = updateTagSchema.parse(body);

    const updated = await tagService.updateTag(
      id,
      sessionContext.organizationId,
      { ...validated, updatedBy: sessionContext.userId },
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/v1/tags/[id]
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
          message: "You do not have permission to delete tags.",
        },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    await tagService.deleteTag(id, sessionContext.organizationId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
