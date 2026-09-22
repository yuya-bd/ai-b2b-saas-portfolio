import { z } from "zod";

/**
 * Request validation for tags.
 *
 * As everywhere, `organizationId` is absent by design — it comes from the
 * session, not the caller.
 */

export const createTagSchema = z.object({
  type: z.string().min(1, "Type is required").max(100),
  name: z.string().min(1, "Name is required").max(255),
});

export const updateTagSchema = createTagSchema.partial();

export const tagQuerySchema = z.object({
  type: z.string().optional(),
  keyword: z.string().optional(),
  includeArchived: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(300).optional().default(100),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type TagQueryInput = z.infer<typeof tagQuerySchema>;
