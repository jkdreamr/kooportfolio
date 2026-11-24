CREATE TABLE booth_post_limits (
  post_id TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  posted_at INTEGER NOT NULL
);
CREATE INDEX booth_post_limits_visitor ON booth_post_limits (visitor_hash, posted_at);
CREATE INDEX booth_post_limits_time ON booth_post_limits (posted_at);
