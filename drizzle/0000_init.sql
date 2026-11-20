CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'VOID', 'EDIT', 'OVERRIDE');--> statement-breakpoint
CREATE TYPE "public"."bet_status" AS ENUM('OPEN', 'WON', 'LOST', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."bet_type" AS ENUM('TOP_SCORER', 'TOP_ASSISTS', 'MATCH_WINNER');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('GOAL', 'ASSIST', 'SAVE', 'KEY_TACKLE');--> statement-breakpoint
CREATE TYPE "public"."lineup_slot" AS ENUM('STARTER', 'BENCH');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('GOING', 'NOT_GOING', 'NO_RESPONSE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('MANAGER', 'ORGANIZER', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"type" "bet_type" NOT NULL,
	"match_id" uuid,
	"target_player_id" uuid,
	"target_team_id" uuid,
	"stake" integer NOT NULL,
	"status" "bet_status" DEFAULT 'OPEN' NOT NULL,
	"payout" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bets_stake_positive" CHECK ("bets"."stake" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"rsvp" "rsvp_status" DEFAULT 'NO_RESPONSE' NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	CONSTRAINT "attendances_gameweekId_playerId_unique" UNIQUE("gameweek_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "gameweeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"lineup_deadline" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "gameweeks_seasonId_number_unique" UNIQUE("season_id","number")
);
--> statement-breakpoint
CREATE TABLE "player_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"rating" double precision NOT NULL,
	"delta" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_ratings_playerId_gameweekId_unique" UNIQUE("player_id","gameweek_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	CONSTRAINT "seasons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "fantasy_lineup_players" (
	"lineup_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"slot" "lineup_slot" NOT NULL,
	"bench_order" integer,
	"is_captain" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fantasy_lineup_players_lineup_id_player_id_pk" PRIMARY KEY("lineup_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"points" integer,
	CONSTRAINT "fantasy_lineups_squadId_gameweekId_unique" UNIQUE("squad_id","gameweek_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_squad_players" (
	"squad_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	CONSTRAINT "fantasy_squad_players_squad_id_player_id_pk" PRIMARY KEY("squad_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	CONSTRAINT "fantasy_squads_userId_seasonId_unique" UNIQUE("user_id","season_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"player_out_id" uuid NOT NULL,
	"player_in_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_squadId_gameweekId_unique" UNIQUE("squad_id","gameweek_id")
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"match_id" uuid,
	"violation_type_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"note" text,
	"issued_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	CONSTRAINT "fines_points_positive" CHECK ("fines"."points" > 0)
);
--> statement-breakpoint
CREATE TABLE "violation_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_points" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "violation_types_name_unique" UNIQUE("name"),
	CONSTRAINT "violation_types_default_points_positive" CHECK ("violation_types"."default_points" > 0)
);
--> statement-breakpoint
CREATE TABLE "player_traits" (
	"player_id" uuid NOT NULL,
	"trait_id" uuid NOT NULL,
	CONSTRAINT "player_traits_player_id_trait_id_pk" PRIMARY KEY("player_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"picture_url" text,
	"bio" text,
	"rating" double precision DEFAULT 1000 NOT NULL,
	"price" numeric(4, 1) DEFAULT '5.0' NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "traits_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'MANAGER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "event_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_day_team_players" (
	"game_day_team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	CONSTRAINT "game_day_team_players_game_day_team_id_player_id_pk" PRIMARY KEY("game_day_team_id","player_id"),
	CONSTRAINT "game_day_team_players_matchId_playerId_unique" UNIQUE("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "game_day_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "game_day_teams_matchId_name_unique" UNIQUE("match_id","name")
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"game_day_team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"related_event_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_events_clientId_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameweek_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"live_scorer_id" uuid,
	"reconciled_by_id" uuid,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "matches_gameweekId_number_unique" UNIQUE("gameweek_id","number")
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_target_player_id_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_target_team_id_game_day_teams_id_fk" FOREIGN KEY ("target_team_id") REFERENCES "public"."game_day_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameweeks" ADD CONSTRAINT "gameweeks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_lineup_players" ADD CONSTRAINT "fantasy_lineup_players_lineup_id_fantasy_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."fantasy_lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_lineup_players" ADD CONSTRAINT "fantasy_lineup_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_lineups" ADD CONSTRAINT "fantasy_lineups_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_lineups" ADD CONSTRAINT "fantasy_lineups_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squad_players" ADD CONSTRAINT "fantasy_squad_players_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squad_players" ADD CONSTRAINT "fantasy_squad_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD CONSTRAINT "fantasy_squads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_squads" ADD CONSTRAINT "fantasy_squads_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_squad_id_fantasy_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."fantasy_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_out_id_players_id_fk" FOREIGN KEY ("player_out_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_player_in_id_players_id_fk" FOREIGN KEY ("player_in_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_violation_type_id_violation_types_id_fk" FOREIGN KEY ("violation_type_id") REFERENCES "public"."violation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_traits" ADD CONSTRAINT "player_traits_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_traits" ADD CONSTRAINT "player_traits_trait_id_traits_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."traits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audit_logs" ADD CONSTRAINT "event_audit_logs_event_id_match_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."match_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_audit_logs" ADD CONSTRAINT "event_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_day_team_players" ADD CONSTRAINT "game_day_team_players_game_day_team_id_game_day_teams_id_fk" FOREIGN KEY ("game_day_team_id") REFERENCES "public"."game_day_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_day_team_players" ADD CONSTRAINT "game_day_team_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_day_team_players" ADD CONSTRAINT "game_day_team_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_day_teams" ADD CONSTRAINT "game_day_teams_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_game_day_team_id_game_day_teams_id_fk" FOREIGN KEY ("game_day_team_id") REFERENCES "public"."game_day_teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_related_event_id_match_events_id_fk" FOREIGN KEY ("related_event_id") REFERENCES "public"."match_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_gameweek_id_gameweeks_id_fk" FOREIGN KEY ("gameweek_id") REFERENCES "public"."gameweeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_live_scorer_id_users_id_fk" FOREIGN KEY ("live_scorer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_reconciled_by_id_users_id_fk" FOREIGN KEY ("reconciled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fines_gameweek_id_player_id_index" ON "fines" USING btree ("gameweek_id","player_id");--> statement-breakpoint
CREATE INDEX "event_audit_logs_event_id_index" ON "event_audit_logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "match_events_match_id_occurred_at_index" ON "match_events" USING btree ("match_id","occurred_at");