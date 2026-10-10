CREATE TABLE "device_push" (
	"device_id" integer PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"token" text NOT NULL,
	"environment" text NOT NULL,
	"notify_waitlist" boolean DEFAULT true NOT NULL,
	"notify_runs" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" integer,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"status" text NOT NULL,
	"detail" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_push" ADD CONSTRAINT "device_push_device_id_app_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."app_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_app_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."app_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_sent_idx" ON "notifications" USING btree ("sent_at");