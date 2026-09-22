import { eq, lt } from "drizzle-orm";
import { CacheKey, cacheAside, DEFAULT_TTL } from "@/lib/cache";
import { invalidateSession } from "@/lib/cache/invalidation";
import { db } from "@/lib/drizzle";
import { session } from "@/lib/drizzle/schema/auth";

export type SessionEntity = typeof session.$inferSelect;
export type CreateSessionData = typeof session.$inferInsert;
export type UpdateSessionData = Partial<
  Omit<CreateSessionData, "id" | "createdAt">
>;

export interface SessionRepository {
  findById(id: string): Promise<SessionEntity | undefined>;
  findByToken(token: string): Promise<SessionEntity | undefined>;
  findByUserId(userId: string): Promise<SessionEntity[]>;
  update(
    id: string,
    data: UpdateSessionData,
  ): Promise<SessionEntity | undefined>;
  delete(id: string): Promise<SessionEntity | undefined>;
  deleteExpired(): Promise<SessionEntity[]>;
}

/**
 * Data access for sessions. No business rules live here — those belong in a
 * service; this layer only reads and writes, and keeps the cache honest.
 */
export class SessionRepositoryImpl implements SessionRepository {
  async findById(id: string): Promise<SessionEntity | undefined> {
    return await db.query.session.findFirst({ where: eq(session.id, id) });
  }

  /**
   * Cached: this runs on essentially every authenticated request, so it is the
   * hottest read in the application.
   */
  async findByToken(token: string): Promise<SessionEntity | undefined> {
    const result = await cacheAside({
      key: CacheKey.session(token),
      ttl: DEFAULT_TTL.SESSION,
      fetcher: async () => {
        const found = await db.query.session.findFirst({
          where: eq(session.token, token),
        });
        return found ?? null;
      },
    });
    return result ?? undefined;
  }

  async findByUserId(userId: string): Promise<SessionEntity[]> {
    return await db.query.session.findMany({
      where: eq(session.userId, userId),
    });
  }

  async update(
    id: string,
    data: UpdateSessionData,
  ): Promise<SessionEntity | undefined> {
    // The cache is keyed by token, not id, so the existing row has to be read
    // before the update to know which key to drop.
    const existing = await db.query.session.findFirst({
      where: eq(session.id, id),
    });

    const [updated] = await db
      .update(session)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(session.id, id))
      .returning();

    if (existing) {
      await invalidateSession(existing.token);
    }

    return updated;
  }

  async delete(id: string): Promise<SessionEntity | undefined> {
    const [deleted] = await db
      .delete(session)
      .where(eq(session.id, id))
      .returning();

    if (deleted) {
      await invalidateSession(deleted.token);
    }

    return deleted;
  }

  async deleteExpired(): Promise<SessionEntity[]> {
    const deleted = await db
      .delete(session)
      .where(lt(session.expiresAt, new Date()))
      .returning();

    for (const row of deleted) {
      await invalidateSession(row.token);
    }

    return deleted;
  }
}

export const sessionRepository = new SessionRepositoryImpl();
