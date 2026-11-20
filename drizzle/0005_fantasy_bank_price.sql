ALTER TABLE "players" ALTER COLUMN "price" SET DEFAULT '8.0';--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD COLUMN "bank" numeric(5, 1) NOT NULL;--> statement-breakpoint
UPDATE "players" SET "price" = 8.0 WHERE "rating" = 1000;
