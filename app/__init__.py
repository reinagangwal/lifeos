"""
LifeOS – Gamified Habit Tracking System
Flask Backend  |  app/__init__.py
"""

from flask import Flask
from .db import init_db_pool
from .routes import auth, habits, expenses, dashboard, reports

def create_app(config=None):
    app = Flask(__name__)

    # ── Default config ───────────────────────────────────────────────────────
    app.config.update(
        SECRET_KEY         = "change-me-in-production",
        DB_HOST            = "localhost",
        DB_PORT            = 3306,
        DB_USER            = "root",
        DB_PASSWORD        = "",
        DB_NAME            = "lifeos",
        DB_POOL_SIZE       = 5,
    )

    if config:
        app.config.update(config)

    # ── Database connection pool ─────────────────────────────────────────────
    init_db_pool(app)

    # ── Register blueprints ──────────────────────────────────────────────────
    app.register_blueprint(auth.bp,       url_prefix="/api/auth")
    app.register_blueprint(habits.bp,     url_prefix="/api/habits")
    app.register_blueprint(expenses.bp,   url_prefix="/api/expenses")
    app.register_blueprint(dashboard.bp,  url_prefix="/api/dashboard")
    app.register_blueprint(reports.bp,    url_prefix="/api/reports")

    return app
