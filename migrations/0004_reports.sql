-- Visitor reports of a wall strip or a shelf post. One row per (item,
-- network): a network is a daily-rotating hash, never a raw IP. An item with
-- REPORT_HIDE_AT distinct reports is hidden from every list until the owner
-- reviews it (GET /api/report with the admin token) and deletes or clears it.
CREATE TABLE IF NOT EXISTS reports (
  kind TEXT NOT NULL CHECK (kind IN ('strip', 'writing')),
  target_id TEXT NOT NULL,
  network TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, target_id, network)
);
CREATE INDEX IF NOT EXISTS reports_target ON reports (kind, target_id);
CREATE INDEX IF NOT EXISTS reports_rate ON reports (network, created_at);
