import { CompanyList } from "@/src/features/companies/CompanyList";

/**
 * Pages stay as thin shells; the implementation lives under src/features.
 * That keeps routing separate from UI, so a screen can be reused or moved
 * without touching the route tree.
 */
export default function CompaniesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Companies</h1>
      <CompanyList />
    </div>
  );
}
