CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('tiktok', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"platforms" "platform"[] NOT NULL,
	"payout_per_1k_views_cents" integer NOT NULL,
	"total_budget_cents" integer NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_payout_positive" CHECK ("campaigns"."payout_per_1k_views_cents" > 0),
	CONSTRAINT "campaigns_budget_positive" CHECK ("campaigns"."total_budget_cents" > 0),
	CONSTRAINT "campaigns_spent_within_budget" CHECK ("campaigns"."spent_cents" >= 0 AND "campaigns"."spent_cents" <= "campaigns"."total_budget_cents"),
	CONSTRAINT "campaigns_window_valid" CHECK ("campaigns"."ends_at" > "campaigns"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "submission_metrics" (
	"submission_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"views" integer NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_metrics_submission_id_captured_at_pk" PRIMARY KEY("submission_id","captured_at"),
	CONSTRAINT "metrics_views_nonnegative" CHECK ("submission_metrics"."views" >= 0)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"locked_earnings_cents" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_rejection_reason_required" CHECK ("submissions"."status" <> 'rejected' OR "submissions"."rejection_reason" IS NOT NULL),
	CONSTRAINT "submissions_locked_earnings_when_approved" CHECK ("submissions"."status" NOT IN ('approved', 'paid') OR "submissions"."locked_earnings_cents" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "submission_metrics" ADD CONSTRAINT "submission_metrics_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_status_created_idx" ON "campaigns" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_campaign_url_unique" ON "submissions" USING btree ("campaign_id","post_url");--> statement-breakpoint
CREATE INDEX "submissions_campaign_status_idx" ON "submissions" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "submissions_creator_created_idx" ON "submissions" USING btree ("creator_id","created_at" DESC NULLS LAST);