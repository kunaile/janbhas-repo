ALTER TABLE "categories" ADD COLUMN "local_name" varchar(255);--> statement-breakpoint
ALTER TABLE "sub_categories" ADD COLUMN "local_name" varchar(255);--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "local_name" varchar(100);--> statement-breakpoint
CREATE INDEX "categories_search_idx" ON "categories" USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("local_name", '')));--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "categories_local_name_idx" ON "categories" USING btree ("local_name");--> statement-breakpoint
CREATE INDEX "sub_categories_search_idx" ON "sub_categories" USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("local_name", '')));--> statement-breakpoint
CREATE INDEX "sub_categories_local_name_idx" ON "sub_categories" USING btree ("local_name");--> statement-breakpoint
CREATE INDEX "tags_search_idx" ON "tags" USING gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("local_name", '')));--> statement-breakpoint
CREATE INDEX "tags_local_name_idx" ON "tags" USING btree ("local_name");