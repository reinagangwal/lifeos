"""
LifeOS – db.py
Thin wrapper around mysql-connector-python connection pool.
All query execution is done via raw SQL — no ORM.
"""

import mysql.connector
from mysql.connector import pooling
from flask import g, current_app

_pool: pooling.MySQLConnectionPool = None


def init_db_pool(app):
    """Called once at app startup to create the connection pool."""
    global _pool
    _pool = pooling.MySQLConnectionPool(
        pool_name     = "lifeos_pool",
        pool_size     = app.config["DB_POOL_SIZE"],
        host          = app.config["DB_HOST"],
        port          = app.config["DB_PORT"],
        user          = app.config["DB_USER"],
        password      = app.config["DB_PASSWORD"],
        database      = app.config["DB_NAME"],
        charset       = "utf8mb4",
        autocommit    = False,
    )


def get_conn():
    """
    Return (or create) a per-request connection stored on Flask's `g`.
    The connection is returned to the pool when the request context tears down.
    """
    if "db_conn" not in g:
        g.db_conn = _pool.get_connection()
    return g.db_conn


def close_conn(e=None):
    conn = g.pop("db_conn", None)
    if conn is not None and conn.is_connected():
        conn.close()


def query(sql: str, params=None, *, fetch_one=False, fetch_all=True,
          commit=False, call_proc=False):
    """
    Generic SQL execution helper.

    Args:
        sql        : Raw SQL string (use %s placeholders).
        params     : Tuple / list of parameters.
        fetch_one  : Return single row dict.
        fetch_all  : Return list of row dicts (default True).
        commit     : Commit after execution (for INSERT/UPDATE/DELETE).
        call_proc  : Use callproc() instead of execute() (stored procedures).

    Returns:
        dict | list[dict] | lastrowid (int) | None
    """
    conn   = get_conn()
    cursor = conn.cursor(dictionary=True)
    try:
        if call_proc:
            cursor.callproc(sql, params or [])
            # Consume all result sets so the connection stays clean
            results = [list(r) for r in cursor.stored_results()]
            if commit:
                conn.commit()
            return results
        else:
            cursor.execute(sql, params or ())
            if commit:
                conn.commit()
                return cursor.lastrowid
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
    except mysql.connector.Error as exc:
        conn.rollback()
        raise exc
    finally:
        cursor.close()
