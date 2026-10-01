CREATE TABLE "app_live_watch" (
	"content_key" text NOT NULL,
	"day" date NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "app_live_watch_content_key_day_pk" PRIMARY KEY("content_key","day")
);
