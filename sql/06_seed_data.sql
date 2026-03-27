-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 06_seed_data.sql  |  Static Reference Data
-- =============================================================================

USE lifeos;

-- ---------------------------------------------------------------------------
-- Badge definitions (criteria must match the ENUM in Badges table)
-- ---------------------------------------------------------------------------
INSERT INTO Badges (badge_name, description, criteria, points_reward) VALUES
('Week Warrior',   'Maintain a streak of 7 days on any habit',      'streak_7',    20),
('Month Master',   'Maintain a streak of 30 days on any habit',     'streak_30',  100),
('Century Club',   'Maintain a streak of 100 days on any habit',    'streak_100', 500),
('First Steps',    'Complete a habit 10 times in total',             'total_10',    15),
('Halfway Hero',   'Complete habits 50 times in total',              'total_50',    50),
('Centurion',      'Complete habits 100 times in total',             'total_100',  100),
('Point Scorer',   'Earn 100 total points',                          'points_100',  10),
('High Scorer',    'Earn 500 total points',                          'points_500',  25),
('Legend',         'Earn 1000 total points',                         'points_1000', 50);
