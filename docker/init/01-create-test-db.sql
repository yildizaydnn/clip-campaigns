-- Tests run against a real Postgres, but never against the app database.
-- Concurrency behaviour (row locks, conditional updates) cannot be tested
-- with mocks, so the test suite gets its own database on the same instance.
CREATE DATABASE clip_campaigns_test;
