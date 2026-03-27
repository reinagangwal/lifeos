-- =============================================================================
-- LifeOS: Gamified Habit Tracking System
-- File: 01_schema.sql  |  Database Schema (3NF Normalized)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS lifeos
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE lifeos;

-- ---------------------------------------------------------------------------
-- 1. USERS
--    Central entity. All other tables reference user_id.
-- ---------------------------------------------------------------------------
CREATE TABLE Users (
    user_id       INT            UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100)   NOT NULL,
    email         VARCHAR(255)   NOT NULL,
    password_hash VARCHAR(255)   NOT NULL,
    points        INT            UNSIGNED NOT NULL DEFAULT 0,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- 2. HABITS
--    habit_type: 'binary'  → log records done/not done (status TINYINT 0/1)
--               'count'   → log records a numeric count
--    frequency:  'daily' | 'weekly'
-- ---------------------------------------------------------------------------
CREATE TABLE Habits (
    habit_id      INT            UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT            UNSIGNED NOT NULL,
    habit_name    VARCHAR(150)   NOT NULL,
    frequency     ENUM('daily', 'weekly') NOT NULL DEFAULT 'daily',
    target_count  TINYINT        UNSIGNED NOT NULL DEFAULT 1
                                 COMMENT 'Times to complete per period',
    habit_type    ENUM('binary', 'count') NOT NULL DEFAULT 'binary',
    current_streak INT           UNSIGNED NOT NULL DEFAULT 0,
    best_streak   INT            UNSIGNED NOT NULL DEFAULT 0,
    is_active     TINYINT(1)     NOT NULL DEFAULT 1,
    created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_habits_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_habits_user (user_id),
    INDEX idx_habits_active (user_id, is_active)
);

-- ---------------------------------------------------------------------------
-- 3. HABIT_LOGS
--    One row per (habit, date). status = 1 means completed for binary habits.
--    completion_count used for count-based habits.
-- ---------------------------------------------------------------------------
CREATE TABLE Habit_Logs (
    log_id            INT          UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    habit_id          INT          UNSIGNED NOT NULL,
    log_date          DATE         NOT NULL,
    status            TINYINT(1)   NOT NULL DEFAULT 0
                                   COMMENT '1 = completed (binary habits)',
    completion_count  SMALLINT     UNSIGNED NOT NULL DEFAULT 0
                                   COMMENT 'Count completed (count-based habits)',
    logged_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_logs_habit
        FOREIGN KEY (habit_id) REFERENCES Habits(habit_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    -- One log per habit per day (prevent duplicates)
    CONSTRAINT uq_log_habit_date UNIQUE (habit_id, log_date),

    INDEX idx_logs_habit_date (habit_id, log_date),
    INDEX idx_logs_date (log_date)
);

-- ---------------------------------------------------------------------------
-- 4. BADGES
--    Static badge definitions. criteria is JSON-flavoured text for readability.
-- ---------------------------------------------------------------------------
CREATE TABLE Badges (
    badge_id    INT          UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    badge_name  VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    criteria    ENUM(
                    'streak_7',   -- 7-day streak on any habit
                    'streak_30',  -- 30-day streak
                    'streak_100', -- 100-day streak
                    'total_10',   -- 10 total completions
                    'total_50',   -- 50 total completions
                    'total_100',  -- 100 total completions
                    'points_100', -- earned 100 points
                    'points_500', -- earned 500 points
                    'points_1000' -- earned 1000 points
                ) NOT NULL,
    points_reward INT UNSIGNED NOT NULL DEFAULT 0,

    CONSTRAINT uq_badge_name UNIQUE (badge_name)
);

-- ---------------------------------------------------------------------------
-- 5. USER_BADGES
-- ---------------------------------------------------------------------------
CREATE TABLE User_Badges (
    user_id      INT      UNSIGNED NOT NULL,
    badge_id     INT      UNSIGNED NOT NULL,
    awarded_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, badge_id),

    CONSTRAINT fk_ub_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ub_badge
        FOREIGN KEY (badge_id) REFERENCES Badges(badge_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- 6. EXPENSES
-- ---------------------------------------------------------------------------
CREATE TABLE Expenses (
    expense_id   INT            UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT            UNSIGNED NOT NULL,
    category     VARCHAR(80)    NOT NULL,
    amount       DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    note         VARCHAR(255)   NULL,
    expense_date DATE           NOT NULL,
    created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_expenses_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_expenses_user_cat  (user_id, category),
    INDEX idx_expenses_user_date (user_id, expense_date)
);

-- ---------------------------------------------------------------------------
-- 7. BUDGETS
--    One budget row per (user, category) per calendar month.
--    month_year stored as 'YYYY-MM' for easy comparison.
-- ---------------------------------------------------------------------------
CREATE TABLE Budgets (
    budget_id     INT            UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT            UNSIGNED NOT NULL,
    category      VARCHAR(80)    NOT NULL,
    monthly_limit DECIMAL(10, 2) NOT NULL CHECK (monthly_limit > 0),
    month_year    CHAR(7)        NOT NULL COMMENT 'Format: YYYY-MM',

    CONSTRAINT fk_budgets_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT uq_budget_user_cat_month UNIQUE (user_id, category, month_year),

    INDEX idx_budgets_user (user_id)
);

-- ---------------------------------------------------------------------------
-- 8. BUDGET_ALERTS  (written to by trigger, read by API)
--    Persists a log row whenever an expense pushes a category over budget.
-- ---------------------------------------------------------------------------
CREATE TABLE Budget_Alerts (
    alert_id        INT            UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT            UNSIGNED NOT NULL,
    category        VARCHAR(80)    NOT NULL,
    month_year      CHAR(7)        NOT NULL,
    budget_limit    DECIMAL(10, 2) NOT NULL,
    total_spent     DECIMAL(10, 2) NOT NULL,
    overage         DECIMAL(10, 2) NOT NULL COMMENT 'total_spent - budget_limit',
    triggered_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expense_id      INT            UNSIGNED NOT NULL
                    COMMENT 'The expense that caused the breach',

    CONSTRAINT fk_alerts_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_alerts_expense
        FOREIGN KEY (expense_id) REFERENCES Expenses(expense_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);
