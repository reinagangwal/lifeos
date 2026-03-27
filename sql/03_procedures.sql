-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 03_procedures.sql  |  Stored Procedures
-- =============================================================================

USE lifeos;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- PROCEDURE 1: sp_award_points
--
-- Called by trg_after_habit_log_insert.
-- Point calculation rules (all SQL, no Python):
--   Base:           +10 for any completion
--   Streak bonuses: +5  if streak ≥ 7
--                   +10 if streak ≥ 30
--                   +25 if streak ≥ 100
--   Habit type:     count-based habits earn proportional points relative
--                   to target_count (e.g., completed 8 of target 10 → 80%)
--
-- IN  p_user_id  : user earning points
-- IN  p_habit_id : the habit that was logged
-- IN  p_streak   : current streak (already calculated by trigger)
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_award_points(
    IN p_user_id  INT UNSIGNED,
    IN p_habit_id INT UNSIGNED,
    IN p_streak   INT UNSIGNED
)
BEGIN
    DECLARE v_base_points    INT DEFAULT 10;
    DECLARE v_bonus_points   INT DEFAULT 0;
    DECLARE v_total_points   INT DEFAULT 0;
    DECLARE v_habit_type     ENUM('binary','count');
    DECLARE v_target         TINYINT UNSIGNED;
    DECLARE v_last_count     SMALLINT UNSIGNED;

    -- Fetch habit meta
    SELECT habit_type, target_count INTO v_habit_type, v_target
    FROM Habits
    WHERE habit_id = p_habit_id;

    -- For count-based habits scale base points proportionally
    IF v_habit_type = 'count' THEN
        SELECT completion_count INTO v_last_count
        FROM Habit_Logs
        WHERE habit_id = p_habit_id
        ORDER BY log_date DESC
        LIMIT 1;

        SET v_base_points = FLOOR(
            10 * LEAST(v_last_count, v_target) / v_target
        );
    END IF;

    -- Streak bonuses (cumulative)
    IF p_streak >= 100 THEN
        SET v_bonus_points = 25;
    ELSEIF p_streak >= 30 THEN
        SET v_bonus_points = 10;
    ELSEIF p_streak >= 7 THEN
        SET v_bonus_points = 5;
    END IF;

    SET v_total_points = v_base_points + v_bonus_points;

    -- Apply to user
    UPDATE Users
    SET points = points + v_total_points
    WHERE user_id = p_user_id;
END$$


-- ---------------------------------------------------------------------------
-- PROCEDURE 2: sp_check_and_award_badges
--
-- Called by trg_after_habit_log_insert after points update.
-- Evaluates all badge criteria for a user and inserts missing badges.
-- Uses INSERT IGNORE so duplicate awarding is silently skipped.
--
-- IN  p_user_id : user to evaluate
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_check_and_award_badges(
    IN p_user_id INT UNSIGNED
)
BEGIN
    DECLARE v_points         INT UNSIGNED DEFAULT 0;
    DECLARE v_max_streak     INT UNSIGNED DEFAULT 0;
    DECLARE v_total_logs     INT UNSIGNED DEFAULT 0;

    -- Snapshot current user stats
    SELECT points INTO v_points
    FROM Users WHERE user_id = p_user_id;

    SELECT COALESCE(MAX(current_streak), 0) INTO v_max_streak
    FROM Habits WHERE user_id = p_user_id;

    SELECT COUNT(*) INTO v_total_logs
    FROM Habit_Logs hl
    JOIN Habits h ON h.habit_id = hl.habit_id
    WHERE h.user_id = p_user_id
      AND (hl.status = 1 OR hl.completion_count > 0);

    -- ── Streak badges ──────────────────────────────────────────────────────
    IF v_max_streak >= 7 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'streak_7';
    END IF;

    IF v_max_streak >= 30 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'streak_30';
    END IF;

    IF v_max_streak >= 100 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'streak_100';
    END IF;

    -- ── Completion badges ──────────────────────────────────────────────────
    IF v_total_logs >= 10 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'total_10';
    END IF;

    IF v_total_logs >= 50 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'total_50';
    END IF;

    IF v_total_logs >= 100 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'total_100';
    END IF;

    -- ── Points badges ──────────────────────────────────────────────────────
    IF v_points >= 100 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'points_100';
    END IF;

    IF v_points >= 500 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'points_500';
    END IF;

    IF v_points >= 1000 THEN
        INSERT IGNORE INTO User_Badges (user_id, badge_id)
        SELECT p_user_id, badge_id FROM Badges WHERE criteria = 'points_1000';
    END IF;
END$$


-- ---------------------------------------------------------------------------
-- PROCEDURE 3: sp_log_habit
--
-- Safe upsert for habit logging.  If a log for this (habit, date) already
-- exists, update it; otherwise insert.  Calling code just invokes this
-- procedure — the trigger fires on INSERT automatically.
--
-- IN  p_habit_id        : habit being logged
-- IN  p_log_date        : date of log (YYYY-MM-DD)
-- IN  p_status          : 1 = done (binary), 0 = not done
-- IN  p_completion_count: numeric count (count-based habits)
-- ---------------------------------------------------------------------------
CREATE PROCEDURE sp_log_habit(
    IN p_habit_id         INT UNSIGNED,
    IN p_log_date         DATE,
    IN p_status           TINYINT(1),
    IN p_completion_count SMALLINT UNSIGNED
)
BEGIN
    -- INSERT triggers fire; UPDATE does NOT re-fire the insert trigger.
    -- To keep streak logic consistent we always delete + re-insert.
    DELETE FROM Habit_Logs
    WHERE habit_id = p_habit_id AND log_date = p_log_date;

    INSERT INTO Habit_Logs (habit_id, log_date, status, completion_count)
    VALUES (p_habit_id, p_log_date, p_status, p_completion_count);
END$$


DELIMITER ;
