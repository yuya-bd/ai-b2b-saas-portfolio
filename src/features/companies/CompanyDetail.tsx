"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { fetchCompany } from "@/src/services/api/company.api";
import type { Company } from "@/src/types/company";

export function CompanyDetail({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompany(companyId)
      .then(setCompany)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load company"),
      );
  }, [companyId]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" asChild>
          <Link href="/companies">Back to companies</Link>
        </Button>
      </div>
    );
  }

  if (!company) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{company.name}</CardTitle>
          <CardDescription>{company.description ?? "—"}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <Field
              label="Registration number"
              value={company.registrationNumber}
            />
            <Field label="Country" value={company.country} />
            <Field
              label="Founded"
              value={company.foundedYear ? String(company.foundedYear) : null}
            />
            <Field label="Contact" value={company.contactName} />
            <Field label="Website" value={company.website} />
            <Field label="Status" value={company.status} />
          </dl>
        </CardContent>
      </Card>

      <Button variant="outline" asChild className="self-start">
        <Link href="/companies">Back to companies</Link>
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </>
  );
}
