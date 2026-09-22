export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationMeta extends PaginationOptions {
  total: number;
  totalPages: number;
}

/** Envelope returned by every list endpoint. */
export interface ListResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}
