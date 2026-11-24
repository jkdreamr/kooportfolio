CREATE TABLE leaderboard_scores (
  id TEXT PRIMARY KEY NOT NULL,
  board TEXT NOT NULL CHECK(board IN ('rowing-sprint', 'rowing-regatta', 'basketball-attack')),
  score INTEGER NOT NULL CHECK(score >= 1),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 24),
  created_at INTEGER NOT NULL,
  network TEXT NOT NULL
);
CREATE INDEX leaderboard_fastest ON leaderboard_scores(board, score ASC, created_at, id);
CREATE INDEX leaderboard_highest ON leaderboard_scores(board, score DESC, created_at, id);
CREATE INDEX leaderboard_network_rate ON leaderboard_scores(network, created_at);
CREATE INDEX leaderboard_global_rate ON leaderboard_scores(created_at);
