CREATE TABLE `stock_quotes` (
	`symbol` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL
);
