import { NextResponse } from "next/server";
import { openApiSpecV1 } from "@/lib/openapi/spec-v1";

/** The raw OpenAPI document, for tooling and client generation. */
export function GET() {
  return NextResponse.json(openApiSpecV1);
}
