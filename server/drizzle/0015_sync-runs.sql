CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"trigger" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"message" text,
	"log_file" text
);
--> statement-breakpoint
ALTER TABLE "sync_logs" ADD COLUMN "run_id" integer;--> statement-breakpoint
CREATE INDEX "sync_runs_task_started_idx" ON "sync_runs" USING btree ("task","started_at");--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Before this table each step was an entry of its own: each becomes a run of its own, trigger unknown.
INSERT INTO "sync_runs" ("task", "trigger", "status", "started_at", "finished_at", "message")
SELECT "job", 'unknown', "status", "started_at", "finished_at", "message" FROM "sync_logs" ORDER BY "id";--> statement-breakpoint
UPDATE "sync_logs" l SET "run_id" = r."id" FROM "sync_runs" r WHERE r."task" = l."job" AND r."started_at" = l."started_at";
