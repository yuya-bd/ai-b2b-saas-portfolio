import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tagRepository } from "@/lib/repositories/tag.repository";
import {
  createTestContext,
  createTestOrganization,
  createTestTag,
  type TestContext,
} from "@/lib/test/factories";
import { cleanupOrganization } from "@/lib/test/helpers";

describe("TagRepository", () => {
  let ctx: TestContext;
  let otherOrganizationId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const other = await createTestOrganization();
    otherOrganizationId = other.organizationId;
  });

  afterAll(async () => {
    await cleanupOrganization(ctx.organizationId);
    await cleanupOrganization(otherOrganizationId);
  });

  describe("create", () => {
    it("stores a tag scoped to its organization", async () => {
      const created = await tagRepository.create({
        organizationId: ctx.organizationId,
        type: "category",
        name: "Enterprise",
      });

      expect(created.id).toBeDefined();
      expect(created.organizationId).toBe(ctx.organizationId);
      expect(created.isArchived).toBe(false);
    });

    it("rejects a duplicate type and name within one organization", async () => {
      await tagRepository.create({
        organizationId: ctx.organizationId,
        type: "stage",
        name: "Seed",
      });

      await expect(
        tagRepository.create({
          organizationId: ctx.organizationId,
          type: "stage",
          name: "Seed",
        }),
      ).rejects.toThrow();
    });

    it("allows the same tag in a different organization", async () => {
      await tagRepository.create({
        organizationId: ctx.organizationId,
        type: "region",
        name: "APAC",
      });

      const theirs = await tagRepository.create({
        organizationId: otherOrganizationId,
        type: "region",
        name: "APAC",
      });

      expect(theirs.id).toBeDefined();
    });
  });

  describe("findById", () => {
    it("returns the tag when the organization matches", async () => {
      const id = await createTestTag({
        organizationId: ctx.organizationId,
        name: "Findable",
      });

      expect((await tagRepository.findById(id, ctx.organizationId))?.name).toBe(
        "Findable",
      );
    });

    it("returns undefined for a tag in another organization", async () => {
      const id = await createTestTag({ organizationId: otherOrganizationId });

      expect(
        await tagRepository.findById(id, ctx.organizationId),
      ).toBeUndefined();
    });
  });

  describe("findMany", () => {
    it("returns only the caller's organization", async () => {
      await createTestTag({
        organizationId: otherOrganizationId,
        name: "Hidden",
      });

      const results = await tagRepository.findMany(
        { organizationId: ctx.organizationId },
        { page: 1, limit: 200 },
      );

      expect(
        results.every((t) => t.organizationId === ctx.organizationId),
      ).toBe(true);
    });

    it("filters by type", async () => {
      const org = await createTestOrganization();
      await createTestTag({
        organizationId: org.organizationId,
        type: "colour",
        name: "Red",
      });
      await createTestTag({
        organizationId: org.organizationId,
        type: "size",
        name: "Large",
      });

      const results = await tagRepository.findMany(
        { organizationId: org.organizationId, type: "colour" },
        { page: 1, limit: 200 },
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Red");

      await cleanupOrganization(org.organizationId);
    });

    it("hides archived tags unless asked for them", async () => {
      const id = await createTestTag({
        organizationId: ctx.organizationId,
        name: "Archived Tag",
      });
      await tagRepository.update(id, ctx.organizationId, { isArchived: true });

      const visible = await tagRepository.findMany(
        { organizationId: ctx.organizationId },
        { page: 1, limit: 200 },
      );
      const all = await tagRepository.findMany(
        { organizationId: ctx.organizationId, includeArchived: true },
        { page: 1, limit: 200 },
      );

      expect(visible.some((t) => t.id === id)).toBe(false);
      expect(all.some((t) => t.id === id)).toBe(true);
    });
  });

  describe("count", () => {
    it("counts with the same filter used to list", async () => {
      const org = await createTestOrganization();
      await createTestTag({ organizationId: org.organizationId, name: "A" });
      await createTestTag({ organizationId: org.organizationId, name: "B" });

      expect(
        await tagRepository.count({ organizationId: org.organizationId }),
      ).toBe(2);

      await cleanupOrganization(org.organizationId);
    });
  });

  describe("update and delete", () => {
    it("does not touch a tag in another organization", async () => {
      const id = await createTestTag({
        organizationId: otherOrganizationId,
        name: "Untouchable",
      });

      expect(
        await tagRepository.update(id, ctx.organizationId, {
          name: "Hijacked",
        }),
      ).toBeUndefined();
      expect(
        await tagRepository.delete(id, ctx.organizationId),
      ).toBeUndefined();
      expect(
        await tagRepository.findById(id, otherOrganizationId),
      ).toBeDefined();
    });

    it("deletes a tag in the caller's organization", async () => {
      const id = await createTestTag({ organizationId: ctx.organizationId });

      expect((await tagRepository.delete(id, ctx.organizationId))?.id).toBe(id);
      expect(
        await tagRepository.findById(id, ctx.organizationId),
      ).toBeUndefined();
    });
  });
});
