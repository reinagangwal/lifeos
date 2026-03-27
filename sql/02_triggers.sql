-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 02_triggers.sql  |  All Database Triggers
-- =============================================================================

USE lifeos;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- TRIGGER 1: trg_after_habit_log_insert
--
-- Fires AFTER a row is inserted into Habit_Logs.
-- Responsibilities:
--   (a) Recalculate current_streak for the habit using a consecutive-date
--       window query — NO Python involved.
--   (b) Update best_streak if current_streak exceeds it.
--   (c) Call sp_award_points to credit the user for this completion.
--   (d) Call sp_check_and_award_badges to evaluate badge eligibility.
--
-- Streak logic explanation:
--   We look backwards from the NEW log_date and count how many consecutive
--   calendar days exist in Habit_Logs for this habit_id. We use a variable
--   assignment trick (@d) to detect gaps.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_after_habit_log_insert
AFTER INSERT ON Habit_Logs
FOR EACH ROW
BEGIN
    DECLARE v_streak    INT UNSIGNED DEFAULT 0;
    DECLARE v_user_id   INT UNSIGNED;

    -- Only process if this log actually marks a completion
    IF NEW.status = 1 OR NEW.completion_count > 0 THEN

        -- ── (a) Recalculate streak ─────────────────────────────────────────
        -- Walk back through logs for this habit ordered descending.
        -- A variable @prev_date tracks the last-seen date; once a gap > 1 day
        -- is found the streak resets.  We use a subquery approach compatible
        -- with MySQL 5.7+ (no window functions required).
        SET @prev_date := NULL;
        SET @streak    := 0;
        SET @gap_found := 0;

        -- Build streak by iterating completed logs newest → oldest
        SELECT SUM(is_consecutive) INTO v_streak
        FROM (
            SELECT
                log_date,
                CASE
                    WHEN @prev_date IS NULL THEN
                        -- First row: start streak at 1
                        (SELECT @prev_date := log_date, @streak := 1, 1)
                    WHEN DATEDIFF(@prev_date, log_date) = 1 AND @gap_found = 0 THEN
                        -- Consecutive day: extend streak
                        (SELECT @prev_date := log_date, @streak := @streak + 1, 1)
                    ELSE
                        -- Gap found: stop counting
                        (SELECT @gap_found := 1, 0)
                END AS is_consecutive
            FROM Habit_Logs
            WHERE habit_id = NEW.habit_id
              AND (status = 1 OR completion_count > 0)
            ORDER BY log_date DESC
        ) AS streak_calc;

        -- Coalesce NULL to 0 (no logs)
        SET v_streak = COALESCE(v_streak, 0);

        -- ── (b) Update habit streaks ───────────────────────────────────────
        UPDATE Habits
        SET
            current_streak = v_streak,
            best_streak    = GREATEST(best_streak, v_streak)
        WHERE habit_id = NEW.habit_id;

        -- ── (c) Award points ───────────────────────────────────────────────
        -- Fetch user_id for this habit
        SELECT user_id INTO v_user_id
        FROM Habits
        WHERE habit_id = NEW.habit_id;

        CALL sp_award_points(v_user_id, NEW.habit_id, v_streak);

        -- ── (d) Check badge eligibility ────────────────────────────────────
        CALL sp_check_and_award_badges(v_user_id);

    END IF;
END$$


-- ---------------------------------------------------------------------------
-- TRIGGER 2: trg_after_expense_insert
--
-- Fires AFTER a row is inserted into Expenses.
-- Checks whether total spending in the same (user, category, month) now
-- exceeds the Budget monthly_limit.
-- If a Budget row exists AND is exceeded, write a row to Budget_Alerts.
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_after_expense_insert
AFTER INSERT ON Expenses
FOR EACH ROW
BEGIN
    DECLARE v_limit     DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_spent     DECIMAL(10,2) DEFAULT 0;
    DECLARE v_month_year CHAR(7);

    SET v_month_year = DATE_FORMAT(NEW.expense_date, '%Y-%m');

    -- Look up budget for this user / category / month
    SELECT monthly_limit INTO v_limit
    FROM Budgets
    WHERE user_id    = NEW.user_id
      AND category   = NEW.category
      AND month_year = v_month_year
    LIMIT 1;

    -- Only proceed if a budget exists for this category+month
    IF v_limit IS NOT NULL THEN

        -- Sum all expenses in this user / category / month (including NEW row)
        SELECT COALESCE(SUM(amount), 0) INTO v_spent
        FROM Expenses
        WHERE user_id      = NEW.user_id
          AND category     = NEW.category
          AND DATE_FORMAT(expense_date, '%Y-%m') = v_month_year;

        -- If over budget, log an alert
        IF v_spent > v_limit THEN
            INSERT INTO Budget_Alerts
                (user_id, category, month_year, budget_limit, total_spent, overage, expense_id)
            VALUES
                (NEW.user_id, NEW.category, v_month_year,
                 v_limit, v_spent, v_spent - v_limit, NEW.expense_id);
        END IF;

    END IF;
END$$


DELIMITER ;
