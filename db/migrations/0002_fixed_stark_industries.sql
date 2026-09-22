CREATE TABLE "company_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"question" text NOT NULL,
	"summary" text NOT NULL,
	"key_points" jsonb NOT NULL,
	"sentiment" varchar(20) NOT NULL,
	"confidence" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	CONSTRAINT "uniq_company_analyses_job_id" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "company_analyses" ADD CONSTRAINT "company_analyses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_analyses" ADD CONSTRAINT "company_analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_analyses" ADD CONSTRAINT "company_analyses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_company_analyses_organization_id" ON "company_analyses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_company_analyses_company_id" ON "company_analyses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_analyses_created_at" ON "company_analyses" USING btree ("created_at");