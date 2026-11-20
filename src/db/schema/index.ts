// Database schema, split by domain. Keep the "Core tables" section of CLAUDE.md in sync.
//
// Vocabulary (see CLAUDE.md): "game_day_teams" is the ephemeral weekly grouping,
// "fantasy_squads" is a manager's persistent roster. Never call either just "team".
export * from "./enums";
export * from "./people";
export * from "./calendar";
export * from "./matches";
export * from "./fines";
export * from "./fantasy";
export * from "./betting";
