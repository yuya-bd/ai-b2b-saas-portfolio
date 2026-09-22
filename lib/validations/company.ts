import { z } from "zod";

/**
 * Request validation for companies.
 *
 * `organizationId` deliberately does not appear in any of these schemas. It
 * comes from the caller's session, never from the request body or query
 * string — accepting it from the client would let anyone read and write
 * another tenant's data by changing one value.
 */

const CURRENT_YEAR = new Date().getFullYear();

export const createCompanySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  departmentId: z.string().min(1).nullable().optional(),
  registrationNumber: z.string().max(64).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  foundedYear: z
    .number()
    .int()
    .min(1800)
    .max(CURRENT_YEAR)
    .nullable()
    .optional(),
  contactName: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  website: z.string().url("Must be a valid URL").max(512).nullable().optional(),
  externalDatabaseUrl: z.string().url().max(512).nullable().optional(),
  documentStorageUrl: z.string().url().max(512).nullable().optional(),
  status: z.enum(["active", "inactive", "closed"]).optional(),
});

export const updateCompanySchema = createCompanySchema.partial();

/**
 * Query parameters arrive as strings, so numeric and boolean fields are
 * coerced here rather than in the handler.
 */
export const companyQuerySchema = z.object({
  keyword: z.string().optional(),
  country: z.string().optional(),
  departmentId: z.string().optional(),
  status: z.enum(["active", "inactive", "closed"]).optional(),
  includeArchived: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  page: z.coerce.number().int().positive().optional().default(1),
  // Capped so a caller cannot ask for the whole table in one request.
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CompanyQueryInput = z.infer<typeof companyQuerySchema>;
