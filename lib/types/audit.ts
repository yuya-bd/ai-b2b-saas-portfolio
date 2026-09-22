/**
 * Actions worth recording in the audit log. Reads are not audited; only
 * changes and imports are.
 */
export type AuditAction =
  | "COMPANY_CREATE"
  | "COMPANY_UPDATE"
  | "COMPANY_DELETE"
  | "COMPANY_ANALYSIS_REQUEST"
  | "TAG_CREATE"
  | "TAG_UPDATE"
  | "TAG_DELETE"
  | "MEMBER_UPDATE"
  | "MEMBER_DELETE"
  | "ORGANIZATION_UPDATE"
  | "CSV_IMPORT";

/** The kind of record an action applied to. */
export type EntityType =
  | "company"
  | "company_analysis"
  | "tag"
  | "member"
  | "organization";
