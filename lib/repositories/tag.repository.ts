import { and, asc, count, eq, ilike, type SQL } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { tags } from "@/lib/drizzle/schema/tags";
import type { PaginationOptions } from "@/lib/types/api";

export type TagEntity = typeof tags.$inferSelect;
export type CreateTagData = typeof tags.$inferInsert;
export type UpdateTagData = Partial<
  Omit<CreateTagData, "id" | "organizationId" | "createdAt">
>;

export interface TagFilter {
  organizationId: string;
  type?: string;
  keyword?: string;
  includeArchived?: boolean;
}

export interface TagRepository {
  findById(id: string, organizationId: string): Promise<TagEntity | undefined>;
  findMany(
    filter: TagFilter,
    pagination: PaginationOptions,
  ): Promise<TagEntity[]>;
  count(filter: TagFilter): Promise<number>;
  create(data: CreateTagData): Promise<TagEntity>;
  update(
    id: string,
    organizationId: string,
    data: UpdateTagData,
  ): Promise<TagEntity | undefined>;
  delete(id: string, organizationId: string): Promise<TagEntity | undefined>;
}

export class TagRepositoryImpl implements TagRepository {
  private buildWhere(filter: TagFilter): SQL | undefined {
    const conditions: SQL[] = [eq(tags.organizationId, filter.organizationId)];

    if (!filter.includeArchived) {
      conditions.push(eq(tags.isArchived, false));
    }
    if (filter.type) {
      conditions.push(eq(tags.type, filter.type));
    }
    if (filter.keyword) {
      conditions.push(ilike(tags.name, `%${filter.keyword}%`));
    }

    return and(...conditions);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<TagEntity | undefined> {
    return await db.query.tags.findFirst({
      where: and(eq(tags.id, id), eq(tags.organizationId, organizationId)),
    });
  }

  async findMany(
    filter: TagFilter,
    pagination: PaginationOptions,
  ): Promise<TagEntity[]> {
    return await db
      .select()
      .from(tags)
      .where(this.buildWhere(filter))
      .orderBy(asc(tags.type), asc(tags.name))
      .limit(pagination.limit)
      .offset((pagination.page - 1) * pagination.limit);
  }

  async count(filter: TagFilter): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(tags)
      .where(this.buildWhere(filter));
    return row?.value ?? 0;
  }

  async create(data: CreateTagData): Promise<TagEntity> {
    const [created] = await db.insert(tags).values(data).returning();
    if (!created) {
      throw new Error("Failed to create tag");
    }
    return created;
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdateTagData,
  ): Promise<TagEntity | undefined> {
    const [updated] = await db
      .update(tags)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tags.id, id), eq(tags.organizationId, organizationId)))
      .returning();
    return updated;
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<TagEntity | undefined> {
    const [deleted] = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.organizationId, organizationId)))
      .returning();
    return deleted;
  }
}

export const tagRepository = new TagRepositoryImpl();
