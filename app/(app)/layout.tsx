import Link from "next/link";
import { APP_NAME } from "@/lib/constants/app";

/**
 * Shell for authenticated pages. Middleware has already redirected anyone
 * without a session cookie, so this layout can assume a signed-in user.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/companies" className="font-semibold">
            {APP_NAME}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link
              href="/companies"
              className="text-muted-foreground hover:text-foreground"
            >
              Companies
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
