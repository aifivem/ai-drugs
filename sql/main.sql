-- Tables of this resource: CREATE TABLE IF NOT EXISTS, names prefixed with the resource (ai_<name>_...),
-- every table ending with ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;".
-- Installed by createDatabaseTables on start: missing tables and columns are added, nothing is dropped,
-- keys are only created with a new table (plan indexes before the first release).

-- Weed plants in the world. owner = ai_core_characters.id of the planter (plants per character are limited).
-- All rows are loaded at start; rotten plants are deleted by the server, so the table stays small.
CREATE TABLE IF NOT EXISTS `ai_drugs_plants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner` INT UNSIGNED NOT NULL,
  `x` FLOAT NOT NULL,
  `y` FLOAT NOT NULL,
  `z` FLOAT NOT NULL,
  `planted_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `owner` (`owner`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
