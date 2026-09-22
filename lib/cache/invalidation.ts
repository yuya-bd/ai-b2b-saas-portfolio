import { CacheKey, cacheDel, cacheDelByPattern, KEY_PREFIX } from "./index";

/**
 * Cache invalidation, called from the mutating methods of repositories and
 * from Better Auth's database hooks.
 *
 * Keeping these in one file means the set of things that can go stale is
 * enumerable, rather than scattered across every call site that writes.
 */

export async function invalidateSession(token: string): Promise<void> {
  await cacheDel(CacheKey.session(token));
}

/** After a role change, a department move, or removal from an organization. */
export async function invalidateMember(
  userId: string,
  organizationId: string,
): Promise<void> {
  await cacheDel(
    CacheKey.member(userId, organizationId),
    CacheKey.memberMe(userId, organizationId),
  );
}

/** After a change to the user themselves, across every organization. */
export async function invalidateMemberByUser(userId: string): Promise<void> {
  await cacheDelByPattern(`${KEY_PREFIX}member:${userId}:*`);
  await cacheDelByPattern(`${KEY_PREFIX}member-me:${userId}:*`);
}

/** After a change to the organization, across every one of its members. */
export async function invalidateMemberByOrganization(
  organizationId: string,
): Promise<void> {
  await cacheDelByPattern(`${KEY_PREFIX}member:*:${organizationId}`);
  await cacheDelByPattern(`${KEY_PREFIX}member-me:*:${organizationId}`);
}

/**
 * After any write to companies.
 *
 * List results are cached per filter combination, so there is no way to know
 * which entries a given write affected. Dropping the whole namespace for the
 * organization is the only correct choice.
 */
export async function invalidateCompaniesByOrganization(
  organizationId: string,
): Promise<void> {
  await cacheDelByPattern(`${KEY_PREFIX}companies:list:${organizationId}:*`);
  await cacheDelByPattern(`${KEY_PREFIX}companies:count:${organizationId}:*`);
}

/** After any write to tags. Same reasoning as companies. */
export async function invalidateTagsByOrganization(
  organizationId: string,
): Promise<void> {
  await cacheDelByPattern(`${KEY_PREFIX}tags:list:${organizationId}:*`);
  await cacheDelByPattern(`${KEY_PREFIX}tags:count:${organizationId}:*`);
}
