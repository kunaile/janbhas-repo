DROP INDEX "article_tags_unique_idx";--> statement-breakpoint
DROP INDEX "articles_search_idx";--> statement-breakpoint
DROP INDEX "articles_sub_category_idx";--> statement-breakpoint
DROP INDEX "articles_editor_idx";--> statement-breakpoint
DROP INDEX "articles_unique_content_idx";--> statement-breakpoint
DROP INDEX "authors_search_idx";--> statement-breakpoint
DROP INDEX "categories_search_idx";--> statement-breakpoint
DROP INDEX "editors_github_idx";--> statement-breakpoint
DROP INDEX "newsletter_country_idx";--> statement-breakpoint
DROP INDEX "newsletter_region_idx";--> statement-breakpoint
DROP INDEX "newsletter_location_idx";--> statement-breakpoint
DROP INDEX "newsletter_continent_idx";--> statement-breakpoint
DROP INDEX "newsletter_isp_idx";--> statement-breakpoint
DROP INDEX "newsletter_proxy_idx";--> statement-breakpoint
DROP INDEX "newsletter_mobile_idx";--> statement-breakpoint
DROP INDEX "newsletter_location_data_idx";--> statement-breakpoint
DROP INDEX "newsletter_status_country_idx";--> statement-breakpoint
DROP INDEX "newsletter_active_subscribers_idx";--> statement-breakpoint
DROP INDEX "sub_categories_search_idx";--> statement-breakpoint
DROP INDEX "sub_categories_unique_idx";--> statement-breakpoint
DROP INDEX "sub_categories_local_name_idx";--> statement-breakpoint
DROP INDEX "tags_search_idx";--> statement-breakpoint
DROP INDEX "tags_name_idx";--> statement-breakpoint
DROP INDEX "tags_local_name_idx";--> statement-breakpoint
CREATE INDEX "articles_published_category_idx" ON "articles" USING btree ("is_published","category_id","language_id");--> statement-breakpoint
CREATE INDEX "authors_name_idx" ON "authors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "authors_local_name_idx" ON "authors" USING btree ("local_name");--> statement-breakpoint
CREATE INDEX "sub_categories_name_idx" ON "sub_categories" USING btree ("name");