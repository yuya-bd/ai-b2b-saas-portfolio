import { and, eq, isNull } from "drizzle-orm";
import { CacheKey, cacheAside, DEFAULT_TTL } from "@/lib/cache";
import { invalidateMember } from "@/lib/cache/invalidation";
import { db } from "@/lib/drizzle";
import { department, member, user } from "@/lib/drizzle/schema/auth";

export type MemberEntity = typeof member.$inferSelect;
export type CreateMemberData = typeof member.$inferInsert;
export type UpdateMemberData = Partial<
  Omit<CreateMemberData, "id" | "createdAt">
>;

/** Shape used by member list screens. */
export type MemberWithUser = MemberEntity & {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: boolean;
    lastLoginAt: Date | null;
  };
  department: {
    id: string;
    name: string;
  } | null;
};

export interface MemberRepository {
  findById(id: string): Promise<MemberEntity | undefined>;
  findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<MemberEntity | undefined>;
  findByOrganizationIdWithUser(
    organizationId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<MemberWithUser[]>;
  create(data: CreateMemberData): Promise<MemberEntity>;
  update(id: string, data: UpdateMemberData): Promise<MemberEntity | undefined>;
  softDelete(id: string): Promise<MemberEntity | undefined>;
}

export class MemberRepositoryImpl implements MemberRepository {
  async findById(id: string): Promise<MemberEntity | undefined> {
    return await db.query.member.findFirst({ where: eq(member.id, id) });
  }

  /**
   * Cached: every authorization decision reads this to learn the caller's
   * role, so it runs alongside the session lookup on each request.
   */
  async findByUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<MemberEntity | undefined> {
    const result = await cacheAside({
      key: CacheKey.member(userId, organizationId),
      ttl: DEFAULT_TTL.MEMBER,
      fetcher: async () => {
        const found = await db.query.member.findFirst({
          where: and(
            eq(member.userId, userId),
            eq(member.organizationId, organizationId),
            isNull(member.deletedAt),
          ),
        });
        return found ?? null;
      },
    });
    return result ?? undefined;
  }

  async findByOrganizationIdWithUser(
    organizationId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<MemberWithUser[]> {
    const conditions = [eq(member.organizationId, organizationId)];
    if (!options?.includeDeleted) {
      conditions.push(isNull(member.deletedAt));
    }

    const rows = await db
      .select({
        member,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt,
        },
        department: {
          id: department.id,
          name: department.name,
        },
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .leftJoin(department, eq(member.departmentId, department.id))
      .where(and(...conditions));

    return rows.map((row) => ({
      ...row.member,
      user: row.user,
      department: row.department?.id ? row.department : null,
    }));
  }

  async create(data: CreateMemberData): Promise<MemberEntity> {
    const [created] = await db.insert(member).values(data).returning();
    if (!created) {
      throw new Error("Failed to create member");
    }
    await invalidateMember(created.userId, created.organizationId);
    return created;
  }

  async update(
    id: string,
    data: UpdateMemberData,
  ): Promise<MemberEntity | undefined> {
    const [updated] = await db
      .update(member)
      .set(data)
      .where(eq(member.id, id))
      .returning();

    if (updated) {
      await invalidateMember(updated.userId, updated.organizationId);
    }

    return updated;
  }

  /**
   * Soft delete. Audit rows reference the member, and history should survive
   * someone leaving the organization.
   */
  async softDelete(id: string): Promise<MemberEntity | undefined> {
    const [deleted] = await db
      .update(member)
      .set({ deletedAt: new Date() })
      .where(eq(member.id, id))
      .returning();

    if (deleted) {
      await invalidateMember(deleted.userId, deleted.organizationId);
    }

    return deleted;
  }
}

export const memberRepository = new MemberRepositoryImpl();
