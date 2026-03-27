"""
LifeOS – run.py
Entry point: python run.py
"""

from app import create_app
from app.db import close_conn

app = create_app()
app.teardown_appcontext(close_conn)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
