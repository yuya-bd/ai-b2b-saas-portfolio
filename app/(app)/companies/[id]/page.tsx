import { CompanyDetail } from "@/src/features/companies/CompanyDetail";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Company</h1>
      <CompanyDetail companyId={id} />
    </div>
  );
}
