/** Shape the API returns. Kept separate from the Drizzle row type so the
 * client bundle never imports the database schema. */
export interface Company {
  id: string;
  organizationId: string;
  departmentId: string | null;
  name: string;
  registrationNumber: string | null;
  country: string | null;
  foundedYear: number | null;
  contactName: string | null;
  description: string | null;
  website: string | null;
  externalDatabaseUrl: string | null;
  documentStorageUrl: string | null;
  status: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CompanyListResponse {
  data: Company[];
  pagination: PaginationMeta;
}

/**
 * One model-produced analysis of a company, as the API returns it.
 *
 * There is no status field: the row exists only once the worker has finished,
 * so its presence is the completion signal. What happened before that lives on
 * the job named by `jobId`.
 */
export interface CompanyAnalysis {
  id: string;
  organizationId: string;
  companyId: string;
  jobId: string;
  question: string;
  summary: string;
  keyPoints: string[];
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyAnalysisListResponse {
  data: CompanyAnalysis[];
}

/** What requesting an analysis returns: 202, and the job that was queued. */
export interface AnalysisAccepted {
  jobId: string;
  status: string;
}
