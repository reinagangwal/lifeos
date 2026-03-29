-- =============================================================================
-- LifeOS: Gamified Habit Tracking System (Oracle SQL Version)
-- File: 04_views.sql  |  Analytical Views
-- =============================================================================

-- ---------------------------------------------------------------------------
-- VIEW 1: v_weekly_habit_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_weekly_habit_summary AS
SELECT
    u.user_id,
    u.name                              AS user_name,
    h.habit_id,
    h.habit_name,
    h.frequency,
    EXTRACT(YEAR FROM hl.log_date)      AS log_year,
    TO_NUMBER(TO_CHAR(hl.log_date, 'IW')) AS iso_week,
    MIN(hl.log_date)                    AS week_start,
    CASE h.frequency
        WHEN 'daily'  THEN 7
        WHEN 'weekly' THEN NVL(LENGTH(h.days_of_week) - LENGTH(REPLACE(h.days_of_week, ',', '')) + 1, 1)
    END                                 AS expected_days,
    COUNT(
        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
    )                                   AS completed_days,
    ROUND(
        100.0 * COUNT(
            CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
        ) /
        CASE h.frequency 
            WHEN 'daily' THEN 7 
            ELSE NVL(LENGTH(h.days_of_week) - LENGTH(REPLACE(h.days_of_week, ',', '')) + 1, 1)
        END,
        1
    )                                   AS completion_pct
FROM Habit_Logs hl
JOIN Habits h  ON h.habit_id  = hl.habit_id
JOIN Users  u  ON u.user_id   = h.user_id
GROUP BY
    u.user_id, u.name,
    h.habit_id, h.habit_name, h.frequency, h.days_of_week,
    EXTRACT(YEAR FROM hl.log_date),
    TO_NUMBER(TO_CHAR(hl.log_date, 'IW'));


-- ---------------------------------------------------------------------------
-- VIEW 2: v_monthly_performance_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_monthly_performance_summary AS
SELECT
    u.user_id,
    u.name                              AS user_name,
    u.points                            AS lifetime_points,
    TO_CHAR(hl.log_date, 'YYYY-MM')     AS month_year,
    COUNT(DISTINCT h.habit_id)          AS active_habits,
    COUNT(
        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
    )                                   AS total_completions,
    COUNT(hl.log_id)                    AS total_log_entries,
    ROUND(
        100.0 * COUNT(
            CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
        ) / NULLIF(COUNT(hl.log_id), 0),
        1
    )                                   AS overall_completion_pct
FROM Habit_Logs hl
JOIN Habits h ON h.habit_id = hl.habit_id
JOIN Users  u ON u.user_id  = h.user_id
GROUP BY
    u.user_id, u.name, u.points,
    TO_CHAR(hl.log_date, 'YYYY-MM');


-- ---------------------------------------------------------------------------
-- VIEW 3: v_habit_performance
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
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_budget_usage AS
SELECT
    b.user_id,
    u.name                                    AS user_name,
    b.category,
    b.month_year,
    b.monthly_limit                           AS budget_limit,
    NVL(SUM(e.amount), 0)                     AS total_spent,
    b.monthly_limit - NVL(SUM(e.amount), 0)   AS remaining,
    ROUND(
        100.0 * NVL(SUM(e.amount), 0) / b.monthly_limit,
        1
    )                                         AS pct_used,
    CASE
        WHEN NVL(SUM(e.amount), 0) > b.monthly_limit THEN 1
        ELSE 0
    END                                       AS is_over_budget
FROM Budgets b
JOIN Users u ON u.user_id = b.user_id
LEFT JOIN Expenses e
    ON  e.user_id  = b.user_id
    AND e.category = b.category
    AND TO_CHAR(e.expense_date, 'YYYY-MM') = b.month_year
GROUP BY
    b.user_id, u.name, b.category, b.month_year, b.monthly_limit;
