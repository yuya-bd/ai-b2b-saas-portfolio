import { z } from "zod";

/**
 * Request and model-output validation for company analyses.
 *
 * As everywhere in this directory, `organizationId` deliberately does not
 * appear. It comes from the caller's session.
 */

/**
 * The shape the model must return.
 *
 * This schema is the contract in both directions: the provider converts it
 * into a structured-output format on the way out, and validates the response
 * against it on the way in. Because it is one definition rather than a JSON
 * Schema written alongside a parser, the two can never drift apart — and no
 * code downstream of the provider ever parses free text.
 *
 * The bounds are not decoration. They are the difference between a bad
 * response being rejected at the boundary and being written to the database.
 */
export const companyAnalysisResultSchema = z.object({
  summary: z.string().min(1).max(4000),
  keyPoints: z.array(z.string().min(1).max(500)).min(1).max(10),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().int().min(0).max(100),
});

/**
 * What a caller may ask for.
 *
 * `companyId` comes from the route path rather than the body, so only the
 * question is validated here.
 */
export const requestCompanyAnalysisSchema = z.object({
  question: z.string().min(1, "Question is required").max(1000),
});

/**
 * The queue message body for a COMPANY_ANALYSIS job.
 *
 * Validated on the way out of the producer *and* on the way into the worker.
 * A queue is a trust boundary like any other: a message can be older than the
 * code reading it, hand-written during an incident, or replayed from a
 * dead-letter queue.
 */
export const companyAnalysisPayloadSchema = z.object({
  companyId: z.string().uuid(),
  question: z.string().min(1).max(1000),
});

export type CompanyAnalysisResult = z.infer<typeof companyAnalysisResultSchema>;
export type RequestCompanyAnalysisInput = z.infer<
  typeof requestCompanyAnalysisSchema
>;
export type CompanyAnalysisPayload = z.infer<
  typeof companyAnalysisPayloadSchema
>;
