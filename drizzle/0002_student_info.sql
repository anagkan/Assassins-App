ALTER TABLE `users` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `net_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `puid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_net_id_unique` ON `users` (`net_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_puid_unique` ON `users` (`puid`);