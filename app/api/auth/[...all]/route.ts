import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

/** Better Auth owns every /api/auth/* path. Middleware exempts them. */
export const { GET, POST } = toNextJsHandler(auth);
