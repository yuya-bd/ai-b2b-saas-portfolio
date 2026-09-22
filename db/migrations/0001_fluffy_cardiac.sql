CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"organization_id" text NOT NULL,
	"type" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uniq_tags_org_type_name" UNIQUE("organization_id","type","name")
);
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tags_organization_id" ON "tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tags_type" ON "tags" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_tags_is_archived" ON "tags" USING btree ("is_archived");