-- A global UTC-day limit protects the shared Copernicus service quota.
CREATE TABLE IF NOT EXISTS sentinel_quota (
  period TEXT PRIMARY KEY NOT NULL,
  requests INTEGER NOT NULL CHECK (requests >= 0)
);
