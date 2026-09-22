import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, asc, eq, isNull } from "drizzle-orm";
import { invalidateSession } from "@/lib/cache/invalidation";
import { APP_SLUG } from "@/lib/constants/app";
import { db } from "@/lib/drizzle";
import * as schema from "@/lib/drizzle/schema/auth";
import { member } from "@/lib/drizzle/schema/auth";
import { emailSender } from "@/lib/email";

/**
 * Password reset links live as long as invitation links do. Keeping the two
 * windows equal means there is one expiry policy to reason about, not two.
 */
const INVITATION_EXPIRY_DAYS = Number(process.env.INVITATION_EXPIRY_DAYS) || 14;
const PASSWORD_RESET_EXPIRY_SECONDS = 60 * 60 * 24 * INVITATION_EXPIRY_DAYS;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),

  /**
   * Better Auth writes sessions through its own adapter, bypassing the
   * repository layer. Without these hooks, sign-in, session refresh and
   * sign-out would leave a stale session in the cache.
   */
  databaseHooks: {
    session: {
      create: {
        /**
         * Stamp the session with an organization at sign-in.
         *
         * Every request handler reads `activeOrganizationId` to scope its
         * queries, so a session without one can reach nothing. Filling it in
         * here means signing in is enough to start working.
         *
         * The first membership wins. If users routinely belong to several
         * organizations, keep this as the default and add an endpoint that
         * lets them switch, updating this column.
         */
        before: async (session) => {
          const membership = await db.query.member.findFirst({
            where: and(
              eq(member.userId, session.userId),
              isNull(member.deletedAt),
            ),
            orderBy: asc(member.createdAt),
          });

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
        after: async (session) => {
          await invalidateSession(session.token);
        },
      },
      update: {
        after: async (session) => {
          await invalidateSession(session.token);
        },
      },
      delete: {
        before: async (session) => {
          await invalidateSession(session.token);
          return true;
        },
      },
    },
  },

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.APP_URL,
  trustedOrigins: process.env.APP_URL ? [process.env.APP_URL] : [],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_EXPIRY_SECONDS,
    sendResetPassword: async ({ user, url }) => {
      await emailSender.sendPasswordReset(
        {
          userName: user.name,
          resetLink: url,
          expiresAt: new Date(
            Date.now() + PASSWORD_RESET_EXPIRY_SECONDS * 1000,
          ),
        },
        { email: user.email, name: user.name },
      );
    },
  },

  /**
   * Application-level brute force protection.
   *
   * Storage is in-memory, so the counters reset when an instance restarts and
   * are not shared across instances. That is deliberate: this is the inner
   * layer, meant to sit behind a WAF rate limit rather than replace it.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
      "/forgot-password/*": { window: 60, max: 3 },
    },
  },

  session: {
    /**
     * Custom columns must be declared, not merely present on the table.
     * Better Auth filters writes down to the fields it knows about, so an
     * undeclared column is silently dropped — the row saves, the value does
     * not, and the failure shows up much later as a request that cannot find
     * an organization.
     *
     * `input: false` keeps it server-assigned: a client cannot set it, which
     * matters because it is the tenant boundary.
     */
    additionalFields: {
      activeOrganizationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    cookiePrefix: APP_SLUG,
    crossSubDomainCookies: {
      enabled: false,
    },
    /**
     * Secure cookies require HTTPS. A staging host served over plain HTTP
     * would silently fail to hold a session with this forced on, so it
     * follows the configured origin instead of being hard-coded.
     */
    useSecureCookies: process.env.APP_URL?.startsWith("https") ?? false,
    /**
     * Behind a load balancer the socket address is the balancer's. Rate
     * limiting keys off the client IP, so it has to come from the forwarding
     * headers instead.
     */
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
