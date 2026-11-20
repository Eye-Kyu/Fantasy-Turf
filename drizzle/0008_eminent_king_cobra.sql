ALTER TABLE "player_ratings" ADD COLUMN "rating_before" double precision;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD COLUMN "streak_before" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "motm_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_motm_player_id_players_id_fk" FOREIGN KEY ("motm_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE player_ratings SET rating_before = rating - delta WHERE rating_before IS NULL;
