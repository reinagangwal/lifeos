-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 04_views.sql  |  Analytical Views
-- =============================================================================

USE lifeos;

-- ---------------------------------------------------------------------------
-- VIEW 1: v_weekly_habit_summary
--
-- For each (user, habit, ISO week) shows:
--   - expected_days   : 7 for daily habits, 1 for weekly habits
--   - completed_days  : count of successful log entries that week
--   - completion_pct  : (completed / expected) * 100
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_weekly_habit_summary AS
SELECT
    u.user_id,
    u.name                              AS user_name,
    h.habit_id,
    h.habit_name,
    h.frequency,
    YEAR(hl.log_date)                   AS log_year,
    WEEK(hl.log_date, 1)                AS iso_week,
    MIN(hl.log_date)                    AS week_start,
    CASE h.frequency
        WHEN 'daily'  THEN 7
        WHEN 'weekly' THEN 1
    END                                  AS expected_days,
    COUNT(
        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
    )                                    AS completed_days,
    ROUND(
        100.0 * COUNT(
            CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
        ) /
        CASE h.frequency WHEN 'daily' THEN 7 ELSE 1 END,
        1
    )                                    AS completion_pct
FROM Habit_Logs hl
JOIN Habits h  ON h.habit_id  = hl.habit_id
JOIN Users  u  ON u.user_id   = h.user_id
GROUP BY
    u.user_id, u.name,
    h.habit_id, h.habit_name, h.frequency,
    YEAR(hl.log_date), WEEK(hl.log_date, 1);


-- ---------------------------------------------------------------------------
-- VIEW 2: v_monthly_performance_summary
--
-- Per (user, month) aggregation:
--   - total habits active that month
--   - total completions
--   - avg daily completion rate
--   - total points earned (proxy: current user points shown; a full
--     point-log table would be added in a v2 schema; here we show
--     total completions as an approximation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_monthly_performance_summary AS
SELECT
    u.user_id,
    u.name                              AS user_name,
    u.points                            AS lifetime_points,
    DATE_FORMAT(hl.log_date, '%Y-%m')  AS month_year,
    COUNT(DISTINCT h.habit_id)          AS active_habits,
    COUNT(
        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
    )                                    AS total_completions,
    COUNT(hl.log_id)                    AS total_log_entries,
    ROUND(
        100.0 * COUNT(
            CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
        ) / NULLIF(COUNT(hl.log_id), 0),
        1
    )                                    AS overall_completion_pct
FROM Habit_Logs hl
JOIN Habits h ON h.habit_id = hl.habit_id
JOIN Users  u ON u.user_id  = h.user_id
GROUP BY
    u.user_id, u.name, u.points,
    DATE_FORMAT(hl.log_date, '%Y-%m');


-- ---------------------------------------------------------------------------
-- VIEW 3: v_habit_performance
--
-- Lifetime stats per habit — used on habit detail cards:
--   - total completions
--   - current & best streak
--   - first / last log dates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_habit_performance AS
SELECT
    h.habit_id,
    h.user_id,
    u.name                              AS user_name,
    h.habit_name,
    h.frequency,
    h.habit_type,
    h.target_count,
    h.current_streak,
    h.best_streak,
    COUNT(
        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
    )                                    AS total_completions,
    COUNT(hl.log_id)                    AS total_log_entries,
    MIN(hl.log_date)                    AS first_log_date,
    MAX(hl.log_date)                    AS last_log_date
FROM Habits h
JOIN Users u        ON u.user_id  = h.user_id
LEFT JOIN Habit_Logs hl ON hl.habit_id = h.habit_id
GROUP BY
    h.habit_id, h.user_id, u.name,
    h.habit_name, h.frequency, h.habit_type,
    h.target_count, h.current_streak, h.best_streak;


-- ---------------------------------------------------------------------------
-- VIEW 4: v_budget_usage
--
-- Monthly budget vs. actual spend per (user, category):
--   - budget_limit
--   - total_spent
--   - remaining        : budget_limit - total_spent  (negative = over)
--   - pct_used
--   - is_over_budget   : 1 / 0 flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_budget_usage AS
SELECT
    b.user_id,
    u.name                                    AS user_name,
    b.category,
    b.month_year,
    b.monthly_limit                           AS budget_limit,
    COALESCE(SUM(e.amount), 0)                AS total_spent,
    b.monthly_limit - COALESCE(SUM(e.amount), 0) AS remaining,
    ROUND(
        100.0 * COALESCE(SUM(e.amount), 0) / b.monthly_limit,
        1
    )                                          AS pct_used,
    CASE
        WHEN COALESCE(SUM(e.amount), 0) > b.monthly_limit THEN 1
        ELSE 0
    END                                        AS is_over_budget
FROM Budgets b
JOIN Users u ON u.user_id = b.user_id
LEFT JOIN Expenses e
    ON  e.user_id  = b.user_id
    AND e.category = b.category
    AND DATE_FORMAT(e.expense_date, '%Y-%m') = b.month_year
GROUP BY
    b.user_id, u.name, b.category, b.month_year, b.monthly_limit;
