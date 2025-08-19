CREATE TABLE "newsletter_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"session_id" varchar(64),
	"browser_fp" varchar(64),
	"submission_time" timestamp with time zone DEFAULT now() NOT NULL,
	"form_interaction_time" integer,
	"honeypot_triggered" boolean DEFAULT false,
	"source" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"email" varchar(320) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"source" varchar(100) NOT NULL,
	"language" varchar(10),
	"country_code" varchar(2),
	"region_code" varchar(10),
	"city" varchar(100),
	"latitude" numeric(10, 6),
	"longitude" numeric(10, 6),
	"continent" varchar(50),
	"district" varchar(100),
	"zip_code" varchar(20),
	"isp" varchar(200),
	"is_proxy" boolean DEFAULT false,
	"is_mobile" boolean DEFAULT false,
	"is_hosting" boolean DEFAULT false,
	"location_data" jsonb,
	"browser_family" varchar(50),
	"os_family" varchar(50),
	"device_type" varchar(20),
	"referrer_domain" varchar(255),
	"timezone" varchar(50),
	"verification_token" uuid DEFAULT gen_random_uuid(),
	"verified_at" timestamp with time zone,
	CONSTRAINT "newsletter_subscribers_uid_unique" UNIQUE("uid"),
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP INDEX "articles_search_idx";--> statement-breakpoint
CREATE INDEX "newsletter_ip_idx" ON "newsletter_submissions" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "newsletter_fp_idx" ON "newsletter_submissions" USING btree ("browser_fp");--> statement-breakpoint
CREATE INDEX "newsletter_email_idx" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "newsletter_status_idx" ON "newsletter_subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "newsletter_country_idx" ON "newsletter_subscribers" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "newsletter_region_idx" ON "newsletter_subscribers" USING btree ("region_code");--> statement-breakpoint
CREATE INDEX "newsletter_location_idx" ON "newsletter_subscribers" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "newsletter_continent_idx" ON "newsletter_subscribers" USING btree ("continent");--> statement-breakpoint
CREATE INDEX "newsletter_isp_idx" ON "newsletter_subscribers" USING btree ("isp");--> statement-breakpoint
CREATE INDEX "newsletter_proxy_idx" ON "newsletter_subscribers" USING btree ("is_proxy");--> statement-breakpoint
CREATE INDEX "newsletter_mobile_idx" ON "newsletter_subscribers" USING btree ("is_mobile");--> statement-breakpoint
CREATE INDEX "newsletter_location_data_idx" ON "newsletter_subscribers" USING gin ("location_data");--> statement-breakpoint
CREATE INDEX "newsletter_status_country_idx" ON "newsletter_subscribers" USING btree ("status","country_code");--> statement-breakpoint
CREATE INDEX "newsletter_active_subscribers_idx" ON "newsletter_subscribers" USING btree ("status","country_code","region_code") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "articles_search_idx" ON "articles" USING gin (to_tsvector('simple',
        coalesce("title", '') || ' ' ||
        coalesce("local_title", '') || ' ' ||
        coalesce("short_description", '') || ' ' ||
        coalesce("markdown_content", '')
      ));