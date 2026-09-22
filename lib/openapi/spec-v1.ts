import { APP_NAME } from "@/lib/constants/app";

/**
 * OpenAPI description of the v1 API, written by hand.
 *
 * Hand-written rather than generated, deliberately: the spec is the contract
 * the client is built against, and generating it from the implementation
 * means the contract silently follows every accidental change instead of
 * catching it. Keeping it separate makes a breaking change something someone
 * has to type.
 *
 * Add a path here whenever a route is added.
 */

const companySchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    organizationId: { type: "string" },
    departmentId: { type: "string", nullable: true },
    name: { type: "string" },
    registrationNumber: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
    foundedYear: { type: "integer", nullable: true },
    contactName: { type: "string", nullable: true },
    description: { type: "string", nullable: true },
    website: { type: "string", nullable: true },
    externalDatabaseUrl: { type: "string", nullable: true },
    documentStorageUrl: { type: "string", nullable: true },
    status: { type: "string", enum: ["active", "inactive", "closed"] },
    isArchived: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "organizationId", "name", "status", "isArchived"],
} as const;

const tagSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    organizationId: { type: "string" },
    type: { type: "string" },
    name: { type: "string" },
    isArchived: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "organizationId", "type", "name", "isArchived"],
} as const;

/**
 * Mirrors `companyAnalysisResultSchema` plus provenance. The structured
 * fields are the contract: a client reads `summary` and `keyPoints`, never a
 * blob of prose it has to interpret.
 */
const companyAnalysisSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    organizationId: { type: "string" },
    companyId: { type: "string", format: "uuid" },
    jobId: { type: "string", format: "uuid" },
    question: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    sentiment: {
      type: "string",
      enum: ["positive", "neutral", "negative"],
    },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    provider: { type: "string" },
    model: { type: "string" },
    inputTokens: { type: "integer", nullable: true },
    outputTokens: { type: "integer", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: [
    "id",
    "organizationId",
    "companyId",
    "jobId",
    "question",
    "summary",
    "keyPoints",
    "sentiment",
    "confidence",
    "provider",
    "model",
  ],
} as const;

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
  },
} as const;

export const openApiSpecV1 = {
  openapi: "3.1.0",
  info: {
    title: `${APP_NAME} API`,
    version: "1.0.0",
    description:
      "Every endpoint is scoped to the organization on the caller's session. " +
      "No endpoint accepts an organization id from the client.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "session_token",
        description: "Session cookie issued at sign-in. Prefixed by APP_SLUG.",
      },
    },
    schemas: {
      Company: companySchema,
      CompanyAnalysis: companyAnalysisSchema,
      Tag: tagSchema,
    },
  },
  security: [{ sessionCookie: [] }],
  paths: {
    "/companies": {
      get: {
        summary: "List companies",
        parameters: [
          { name: "keyword", in: "query", schema: { type: "string" } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "departmentId", in: "query", schema: { type: "string" } },
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["active", "inactive", "closed"] },
          },
          {
            name: "includeArchived",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
        ],
        responses: {
          200: {
            description: "A page of companies",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Company" },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        total: { type: "integer" },
                        totalPages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        summary: "Create a company",
        description: "Requires a role with edit permission.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 255 },
                  departmentId: { type: "string", nullable: true },
                  registrationNumber: { type: "string", nullable: true },
                  country: { type: "string", nullable: true },
                  foundedYear: { type: "integer", nullable: true },
                  contactName: { type: "string", nullable: true },
                  description: { type: "string", nullable: true },
                  website: { type: "string", nullable: true },
                  status: {
                    type: "string",
                    enum: ["active", "inactive", "closed"],
                  },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Company" },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    "/companies/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        summary: "Get a company",
        description:
          "Returns 404 rather than 403 for a company in another organization, " +
          "so the response cannot be used to confirm that an id exists.",
        responses: {
          200: {
            description: "The company",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Company" },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        summary: "Update a company",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          200: {
            description: "Updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Company" },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        summary: "Delete a company",
        responses: {
          204: { description: "Deleted" },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/companies/{id}/analyses": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        summary: "List analyses for a company",
        description: "Newest first. Readable by any role with a session.",
        responses: {
          200: {
            description: "The analyses recorded for this company",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CompanyAnalysis" },
                    },
                  },
                },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        summary: "Request an analysis of a company",
        description:
          "Queues the work and returns 202 with a job id — nothing is " +
          "analysed synchronously. Poll the job, or re-read this collection " +
          "once it reports COMPLETED. Requires an editing role, because each " +
          "call spends money at a metered provider.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  question: { type: "string", minLength: 1, maxLength: 1000 },
                },
                required: ["question"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          202: {
            description: "Accepted and queued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jobId: { type: "string", format: "uuid" },
                    status: { type: "string" },
                  },
                  required: ["jobId", "status"],
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/tags": {
      get: {
        summary: "List tags",
        parameters: [
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "keyword", in: "query", schema: { type: "string" } },
          {
            name: "includeArchived",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 300, default: 100 },
          },
        ],
        responses: {
          200: {
            description: "A page of tags",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Tag" },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        total: { type: "integer" },
                        totalPages: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
      post: {
        summary: "Create a tag",
        description: "Requires a role with edit permission.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  type: { type: "string", maxLength: 100 },
                  name: { type: "string", maxLength: 255 },
                },
                required: ["type", "name"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Tag" },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          409: errorResponse,
        },
      },
    },
    "/tags/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        summary: "Get a tag",
        responses: {
          200: {
            description: "The tag",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Tag" },
              },
            },
          },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      patch: {
        summary: "Update a tag",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
        responses: {
          200: {
            description: "Updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Tag" },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
      delete: {
        summary: "Delete a tag",
        responses: {
          204: { description: "Deleted" },
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
  },
} as const;
