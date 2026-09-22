import { auditLogRepository } from "@/lib/repositories/audit_log.repository";
import type { AuditAction } from "@/lib/types/audit";

export interface RecordAuditLogInput {
  organizationId: string;
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  changes?: unknown;
  ipAddress?: string;
}

export class AuditLogService {
  /**
   * Write one audit entry.
   *
   * Never throws. This runs after the response has been sent, so an
   * exception here cannot reach the client — it would surface as an
   * unhandled rejection and, in some runtimes, take the process down. A
   * failed audit write is logged and dropped instead.
   */
  async record(input: RecordAuditLogInput): Promise<void> {
    try {
      await auditLogRepository.create({
        organizationId: input.organizationId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        changes: input.changes,
        ipAddress: input.ipAddress,
      });
    } catch (error) {
      console.error("[Audit] Failed to record audit log:", error);
    }
  }

  async listByOrganization(organizationId: string, limit?: number) {
    return await auditLogRepository.findByOrganizationId(organizationId, {
      limit,
    });
  }

  async listByEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
  ) {
    return await auditLogRepository.findByEntity(
      organizationId,
      entityType,
      entityId,
    );
  }
}

export const auditLogService = new AuditLogService();
