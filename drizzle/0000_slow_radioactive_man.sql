CREATE TABLE `items` (
	`owner` text NOT NULL,
	`collection` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `collection`, `id`)
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_requests` (
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`target` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`base`, `quote`, `target`)
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`base` text NOT NULL,
	`quote` text NOT NULL,
	`date` text NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`base`, `quote`, `date`)
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`mime` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
