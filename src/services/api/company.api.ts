import type { Company, CompanyListResponse } from "@/src/types/company";

/**
 * Client-side access to the companies API.
 *
 * No organizationId parameter anywhere: the server reads it from the session,
 * so the client has nothing to pass and nothing to get wrong.
 */

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed`);
  }
  return response.json() as Promise<T>;
}

export async function fetchCompanies(params?: {
  keyword?: string;
  page?: number;
  limit?: number;
}): Promise<CompanyListResponse> {
  const search = new URLSearchParams();
  if (params?.keyword) search.set("keyword", params.keyword);
  if (params?.page) search.set("page", String(params.page));
  if (params?.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  return handle<CompanyListResponse>(
    await fetch(`/api/v1/companies${query ? `?${query}` : ""}`),
  );
}

export async function fetchCompany(id: string): Promise<Company> {
  return handle<Company>(await fetch(`/api/v1/companies/${id}`));
}

export async function createCompany(
  input: Partial<Company> & { name: string },
): Promise<Company> {
  return handle<Company>(
    await fetch("/api/v1/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
