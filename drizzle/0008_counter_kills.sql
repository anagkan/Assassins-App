ALTER TABLE `games` ADD `counter_kills` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `kill_reports` ADD `counter_kill` integer DEFAULT false NOT NULL;