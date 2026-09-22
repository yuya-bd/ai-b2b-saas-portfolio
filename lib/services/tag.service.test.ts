import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/api/errors";
import { tagService } from "@/lib/services/tag.service";
import {
  createTestContext,
  createTestTag,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

describe("TagService", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
  });

  it("returns data with pagination metadata", async () => {
    await createTestTag({ organizationId: ctx.organizationId });

    const result = await tagService.getTags(
      { organizationId: ctx.organizationId },
      { page: 1, limit: 10 },
    );

    expect(result.data.length).toBeGreaterThan(0);
    expect(result.pagination.total).toBe(result.data.length);
    expect(result.pagination.totalPages).toBe(1);
  });

  it("reports totalPages 0 when nothing matches", async () => {
    const result = await tagService.getTags(
      { organizationId: ctx.organizationId, keyword: "no-such-tag-xyz" },
      { page: 1, limit: 10 },
    );

    expect(result.data).toHaveLength(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  it("throws NotFoundError instead of returning undefined", async () => {
    await expect(
      tagService.getTagById(UNKNOWN_ID, ctx.organizationId),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates, updates and deletes", async () => {
    const created = await tagService.createTag({
      organizationId: ctx.organizationId,
      type: "lifecycle",
      name: "Active",
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    expect(created.createdBy).toBe(ctx.userId);

    const updated = await tagService.updateTag(created.id, ctx.organizationId, {
      name: "Inactive",
    });
    expect(updated.name).toBe("Inactive");

    await tagService.deleteTag(created.id, ctx.organizationId);
    await expect(
      tagService.getTagById(created.id, ctx.organizationId),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when updating or deleting an unknown id", async () => {
    await expect(
      tagService.updateTag(UNKNOWN_ID, ctx.organizationId, { name: "Nope" }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      tagService.deleteTag(UNKNOWN_ID, ctx.organizationId),
    ).rejects.toThrow(NotFoundError);
  });
});
