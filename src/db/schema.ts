import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// All timestamps are stored as Unix epoch milliseconds.

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  // Collected at self sign-up. Null for admin-created and pre-existing accounts.
  firstName: text("first_name"),
  lastName: text("last_name"),
  netId: text("net_id").unique(), // lowercase, e.g. "ab1234"
  puid: text("puid").unique(), // 9 digits, kept as text to preserve leading zeros
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const GAME_STATUSES = ["draft", "registration", "active", "paused", "finished"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status", { enum: GAME_STATUSES }).notNull().default("draft"),
  joinCode: text("join_code").notNull(),
  // Lets admins stop new sign-ups during registration while teams are sorted out.
  signupsOpen: integer("signups_open", { mode: "boolean" }).notNull().default(true),
  maxTeamSize: integer("max_team_size"), // null = unlimited
  minTeamSize: integer("min_team_size").notNull().default(1),
  rulesMarkdown: text("rules_markdown").notNull().default(""),
  safeZonesMarkdown: text("safe_zones_markdown").notNull().default(""),
  inactivityDays: integer("inactivity_days"), // null = no inactivity deadline
  showKillerInFeed: integer("show_killer_in_feed", { mode: "boolean" }).notNull().default(true),
  pausedAt: integer("paused_at"),
  pausedDurationMs: integer("paused_duration_ms").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  endedAt: integer("ended_at"),
  winnerTeamId: integer("winner_team_id"),
});

export const LIFE_STATUSES = ["alive", "eliminated", "purged"] as const;
export type LifeStatus = (typeof LIFE_STATUSES)[number];

export const teams = sqliteTable(
  "teams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    inviteCode: text("invite_code").notNull(),
    status: text("status", { enum: LIFE_STATUSES }).notNull().default("alive"),
    targetTeamId: integer("target_team_id"),
    kills: integer("kills").notNull().default(0),
    lastKillAt: integer("last_kill_at"),
    // Start of the team's current inactivity window: set at game start, on each kill,
    // on reshuffle, and pushed forward by the length of any pause.
    activityAt: integer("activity_at"),
    eliminatedAt: integer("eliminated_at"),
    eliminatedByTeamId: integer("eliminated_by_team_id"),
  },
  (t) => [index("teams_game_idx").on(t.gameId), uniqueIndex("teams_invite_idx").on(t.inviteCode)],
);

export const participants = sqliteTable(
  "participants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: integer("team_id"), // null = unassigned (registration only)
    status: text("status", { enum: LIFE_STATUSES }).notNull().default("alive"),
    kills: integer("kills").notNull().default(0),
    joinedAt: integer("joined_at").notNull(),
    eliminatedAt: integer("eliminated_at"),
    eliminatedById: integer("eliminated_by_id"),
  },
  (t) => [
    uniqueIndex("participants_game_user_idx").on(t.gameId, t.userId),
    index("participants_team_idx").on(t.teamId),
  ],
);

export const REPORT_STATUSES = ["pending", "approved", "rejected", "stale"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const VICTIM_RESPONSES = ["confirmed", "disputed"] as const;
export type VictimResponse = (typeof VICTIM_RESPONSES)[number];

export const killReports = sqliteTable(
  "kill_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    assassinId: integer("assassin_id").notNull(),
    victimId: integer("victim_id").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status", { enum: REPORT_STATUSES }).notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: integer("reviewed_at"),
    adminNote: text("admin_note"),
    // The victim's answer on their dashboard. A confirmed report is approved on the spot
    // (reviewedBy stays null); a disputed one waits for an admin with the victim's note.
    victimResponse: text("victim_response", { enum: VICTIM_RESPONSES }),
    victimNote: text("victim_note"),
    victimRespondedAt: integer("victim_responded_at"),
    // When an admin acknowledged a victim-confirmed kill in the kill queue.
    adminSeenAt: integer("admin_seen_at"),
  },
  (t) => [index("kill_reports_game_idx").on(t.gameId, t.status)],
);

export const ANNOUNCEMENT_KINDS = ["immunity", "rule", "general"] as const;

export const announcements = sqliteTable(
  "announcements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ANNOUNCEMENT_KINDS }).notNull().default("general"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    activeFrom: integer("active_from").notNull(),
    activeUntil: integer("active_until"),
    createdBy: integer("created_by"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("announcements_game_idx").on(t.gameId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id"),
    actorUserId: integer("actor_user_id"),
    action: text("action").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_game_idx").on(t.gameId)],
);

// Site-wide key/value settings that aren't tied to a game (e.g. the registration code).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type User = typeof users.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type KillReport = typeof killReports.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
