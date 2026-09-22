"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { fetchCompanies } from "@/src/services/api/company.api";
import type { Company, PaginationMeta } from "@/src/types/company";

export function CompanyList() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchCompanies({ keyword, page, limit: 20 });
      setCompanies(result.data);
      setPagination(result.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setIsLoading(false);
    }
  }, [keyword, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Reset to the first page, or a search could land on a page that no
          // longer exists in the narrower result set.
          setPage(1);
          load();
        }}
      >
        <Input
          placeholder="Search companies"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Button type="submit">Search</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Founded</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!isLoading && companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No companies yet.
              </TableCell>
            </TableRow>
          )}
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell>
                <Link
                  href={`/companies/${company.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {company.name}
                </Link>
              </TableCell>
              <TableCell>{company.country ?? "—"}</TableCell>
              <TableCell>{company.foundedYear ?? "—"}</TableCell>
              <TableCell>{company.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
