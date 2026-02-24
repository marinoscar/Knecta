-- Remove Spreadsheet Agent tables and types
-- Tables must be dropped in dependency order (children first)

DROP TABLE IF EXISTS "spreadsheet_runs" CASCADE;
DROP TABLE IF EXISTS "spreadsheet_tables" CASCADE;
DROP TABLE IF EXISTS "spreadsheet_files" CASCADE;
DROP TABLE IF EXISTS "spreadsheet_projects" CASCADE;

DROP TYPE IF EXISTS "SpreadsheetRunStatus";
DROP TYPE IF EXISTS "SpreadsheetTableStatus";
DROP TYPE IF EXISTS "SpreadsheetFileStatus";
DROP TYPE IF EXISTS "SpreadsheetProjectStatus";
