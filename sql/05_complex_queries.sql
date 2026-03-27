-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 05_complex_queries.sql  |  Advanced Analytical Queries
-- =============================================================================

USE lifeos;

-- ===========================================================================
-- QUERY 1: Users who completed ALL their active habits in a given week
--
-- Logic:
--   A user "completed" a week when, for every active habit they own,
--   the number of successful logs within that ISO-week equals or exceeds
--   the expected count (7 for daily, 1 for weekly).
--   We use GROUP BY + HAVING to filter only users meeting the threshold.
--
-- Parameterised: substitute @target_week (ISO week number) and @target_year.
-- ===========================================================================
SET @target_week = 22;
SET @target_year = 2025;

SELECT
    u.user_id,
    u.name,
    COUNT(DISTINCT h.habit_id)    AS total_active_habits,
    -- Habits that met their weekly target
    COUNT(DISTINCT
        CASE
            WHEN habit_logs_in_week.completed_days >=
                 CASE h.frequency WHEN 'daily' THEN 7 ELSE 1 END
            THEN h.habit_id
        END
    )                              AS habits_fully_completed
FROM Users u
JOIN Habits h ON h.user_id = u.user_id AND h.is_active = 1
LEFT JOIN (
    -- Per-habit completion count inside the target week
    SELECT
        habit_id,
        COUNT(*) AS completed_days
    FROM Habit_Logs
    WHERE (status = 1 OR completion_count > 0)
      AND YEAR(log_date) = @target_year
      AND WEEK(log_date, 1) = @target_week
    GROUP BY habit_id
) AS habit_logs_in_week ON habit_logs_in_week.habit_id = h.habit_id
GROUP BY u.user_id, u.name
HAVING
    COUNT(DISTINCT h.habit_id) > 0
    AND COUNT(DISTINCT h.habit_id) =
        COUNT(DISTINCT
            CASE
                WHEN habit_logs_in_week.completed_days >=
                     CASE h.frequency WHEN 'daily' THEN 7 ELSE 1 END
                THEN h.habit_id
            END
        )
ORDER BY u.name;


-- ===========================================================================
-- QUERY 2: Habit with the maximum current streak per user
--
-- Uses a correlated subquery / RANK pattern to return exactly one habit
-- per user — the one with the highest current_streak.
-- ===========================================================================
SELECT
    u.user_id,
    u.name,
    h.habit_id,
    h.habit_name,
    h.current_streak,
    h.best_streak
FROM Habits h
JOIN Users u ON u.user_id = h.user_id
WHERE h.current_streak = (
    -- Correlated subquery: max streak for this user
    SELECT MAX(h2.current_streak)
    FROM Habits h2
    WHERE h2.user_id = h.user_id
)
AND h.is_active = 1
ORDER BY h.current_streak DESC, u.name;


-- ===========================================================================
-- QUERY 3: Users who are over budget in at least one category
--          BUT maintain ≥ 80 % habit completion this month
--
-- Demonstrates a multi-table join + subquery + HAVING with aggregate
-- filtering across two independent domains (expenses & habits).
-- ===========================================================================
SET @current_month = DATE_FORMAT(CURDATE(), '%Y-%m');

SELECT
    u.user_id,
    u.name,
    budget_status.over_budget_categories,
    habit_status.completion_pct
FROM Users u

-- ── Subquery A: users over budget in ≥ 1 category this month ────────────
JOIN (
    SELECT
        b.user_id,
        COUNT(*) AS over_budget_categories
    FROM Budgets b
    JOIN (
        SELECT user_id, category,
               DATE_FORMAT(expense_date, '%Y-%m') AS month_year,
               SUM(amount) AS total_spent
        FROM Expenses
        GROUP BY user_id, category, DATE_FORMAT(expense_date, '%Y-%m')
    ) AS monthly_spend
    ON  monthly_spend.user_id    = b.user_id
    AND monthly_spend.category   = b.category
    AND monthly_spend.month_year = b.month_year
    WHERE b.month_year = @current_month
      AND monthly_spend.total_spent > b.monthly_limit
    GROUP BY b.user_id
    HAVING COUNT(*) >= 1
) AS budget_status ON budget_status.user_id = u.user_id

-- ── Subquery B: users with ≥ 80 % habit completion this month ────────────
JOIN (
    SELECT
        h.user_id,
        ROUND(
            100.0 * SUM(
                CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 ELSE 0 END
            ) / NULLIF(COUNT(hl.log_id), 0),
            1
        ) AS completion_pct
    FROM Habits h
    JOIN Habit_Logs hl ON hl.habit_id = h.habit_id
    WHERE DATE_FORMAT(hl.log_date, '%Y-%m') = @current_month
    GROUP BY h.user_id
    HAVING completion_pct >= 80
) AS habit_status ON habit_status.user_id = u.user_id

ORDER BY habit_status.completion_pct DESC;


-- ===========================================================================
-- QUERY 4: Top 5 habits by total completions per user (GROUP BY + HAVING)
--
-- Returns habits with at least 5 total completions, ranked within each user.
-- Uses GROUP BY, HAVING, and a correlated rank subquery.
-- ===========================================================================
SELECT
    u.user_id,
    u.name,
    h.habit_id,
    h.habit_name,
    total_completions,
    user_rank
FROM (
    SELECT
        h.habit_id,
        h.user_id,
        h.habit_name,
        COUNT(
            CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
        ) AS total_completions,
        -- Rank within user partition using a correlated count
        (
            SELECT COUNT(*)
            FROM Habits h2
            LEFT JOIN Habit_Logs hl2 ON hl2.habit_id = h2.habit_id
            WHERE h2.user_id = h.user_id
            GROUP BY h2.habit_id
            HAVING COUNT(
                CASE WHEN hl2.status = 1 OR hl2.completion_count > 0 THEN 1 END
            ) > COUNT(
                CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
            )
        ) + 1 AS user_rank
    FROM Habits h
    LEFT JOIN Habit_Logs hl ON hl.habit_id = h.habit_id
    GROUP BY h.habit_id, h.user_id, h.habit_name
    HAVING total_completions >= 5
) AS ranked
JOIN Users u ON u.user_id = ranked.user_id
WHERE user_rank <= 5
ORDER BY u.user_id, user_rank;


-- ===========================================================================
-- QUERY 5: Expense breakdown with running total per user per month
--          (nested subquery for running total, pre-window-function style)
-- ===========================================================================
SELECT
    e.user_id,
    u.name,
    e.expense_id,
    e.category,
    e.amount,
    e.expense_date,
    -- Running total of expenses in same user+month up to this expense_id
    (
        SELECT COALESCE(SUM(e2.amount), 0)
        FROM Expenses e2
        WHERE e2.user_id = e.user_id
          AND DATE_FORMAT(e2.expense_date, '%Y-%m') = DATE_FORMAT(e.expense_date, '%Y-%m')
          AND e2.expense_id <= e.expense_id
    ) AS running_total
FROM Expenses e
JOIN Users u ON u.user_id = e.user_id
ORDER BY e.user_id, e.expense_date, e.expense_id;
