CREATE TABLE writing_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  author TEXT NOT NULL CHECK(length(author) BETWEEN 1 AND 32),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 6000),
  created_at INTEGER NOT NULL,
  delete_hash TEXT NOT NULL,
  network TEXT NOT NULL
);
CREATE INDEX writing_newest ON writing_posts(created_at DESC, id DESC);
CREATE TABLE writing_receipts (network TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX writing_rate ON writing_receipts(network, created_at);
CREATE INDEX writing_global_rate ON writing_receipts(created_at);
CREATE TRIGGER writing_receipt AFTER INSERT ON writing_posts BEGIN
  INSERT INTO writing_receipts(network, created_at) VALUES (NEW.network, NEW.created_at);
  DELETE FROM writing_receipts WHERE created_at <= NEW.created_at - 3600000;
END;
