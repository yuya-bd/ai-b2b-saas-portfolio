import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/drizzle";

/**
 * Health check for the load balancer.
 *
 * Touches the database, so an instance that cannot serve requests is reported
 * unhealthy rather than merely being up. Exempt from auth in middleware.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 },
    );
  }
}
