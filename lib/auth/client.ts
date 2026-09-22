import { createAuthClient } from "better-auth/react";
import type { auth } from "./config";

/** Client-side entry point, for client components and hooks. */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export type { Session, User } from "./config";

export type AuthClient = typeof authClient;
export type InferredSession = typeof auth.$Infer.Session;
