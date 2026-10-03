-- The provider account and the TMDB key come from the environment now: the encrypted copies, their salt and the
-- vault key wrapped for each device go.
DELETE FROM "settings" WHERE "key" IN ('xtream_url', 'xtream_username', 'xtream_password', 'tmdb_api_key', 'enc_salt');--> statement-breakpoint
ALTER TABLE "app_devices" DROP COLUMN "wrapped_key";
