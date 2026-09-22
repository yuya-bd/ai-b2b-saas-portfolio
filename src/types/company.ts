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
