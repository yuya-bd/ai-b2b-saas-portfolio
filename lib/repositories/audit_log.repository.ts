import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/drizzle";
import { auditLogs } from "@/lib/drizzle/schema/audit_logs";

export type AuditLogEntity = typeof auditLogs.$inferSelect;
export type CreateAuditLogData = typeof auditLogs.$inferInsert;

export interface AuditLogRepository {
  create(data: CreateAuditLogData): Promise<AuditLogEntity>;
  findByOrganizationId(
    organizationId: string,
    options?: { limit?: number },
  ): Promise<AuditLogEntity[]>;
  findByEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditLogEntity[]>;
}

export class AuditLogRepositoryImpl implements AuditLogRepository {
  async create(data: CreateAuditLogData): Promise<AuditLogEntity> {
    const [created] = await db.insert(auditLogs).values(data).returning();
    if (!created) {
      throw new Error("Failed to create audit log");
    }
    return created;
  }

  async findByOrganizationId(
    organizationId: string,
    options?: { limit?: number },
  ): Promise<AuditLogEntity[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(options?.limit ?? 100);
  }

  async findByEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditLogEntity[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, organizationId),
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId),
        ),
      )
      .orderBy(desc(auditLogs.occurredAt));
  }
}

export const auditLogRepository = new AuditLogRepositoryImpl();
