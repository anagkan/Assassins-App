CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`active_from` integer NOT NULL,
	`active_until` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `announcements_game_idx` ON `announcements` (`game_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer,
	`actor_user_id` integer,
	`action` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_game_idx` ON `audit_log` (`game_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`join_code` text NOT NULL,
	`max_team_size` integer,
	`min_team_size` integer DEFAULT 1 NOT NULL,
	`rules_markdown` text DEFAULT '' NOT NULL,
	`safe_zones_markdown` text DEFAULT '' NOT NULL,
	`inactivity_days` integer,
	`show_killer_in_feed` integer DEFAULT true NOT NULL,
	`paused_at` integer,
	`paused_duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`winner_team_id` integer
);
--> statement-breakpoint
CREATE TABLE `kill_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`assassin_id` integer NOT NULL,
	`victim_id` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_by` integer,
	`reviewed_at` integer,
	`admin_note` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kill_reports_game_idx` ON `kill_reports` (`game_id`,`status`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`team_id` integer,
	`status` text DEFAULT 'alive' NOT NULL,
	`kills` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	`eliminated_at` integer,
	`eliminated_by_id` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_game_user_idx` ON `participants` (`game_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `participants_team_idx` ON `participants` (`team_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`status` text DEFAULT 'alive' NOT NULL,
	`target_team_id` integer,
	`kills` integer DEFAULT 0 NOT NULL,
	`last_kill_at` integer,
	`activity_at` integer,
	`eliminated_at` integer,
	`eliminated_by_team_id` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_game_idx` ON `teams` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_invite_idx` ON `teams` (`invite_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`photo_path` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);