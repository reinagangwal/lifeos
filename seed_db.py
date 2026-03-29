import datetime
import random
from werkzeug.security import generate_password_hash
from app import create_app
from app.db import query

def generate_seed_data():
    app = create_app()
    with app.app_context():
        email = "demo@example.com"
        
        # 1. Setup User
        user = query("SELECT user_id FROM Users WHERE email = %s", (email,), fetch_one=True)
        if user:
            user_id = user['user_id']
            print(f"Found existing demo user (ID: {user_id}), cleaning up old data...")
            query("DELETE FROM Habit_Logs WHERE habit_id IN (SELECT habit_id FROM Habits WHERE user_id = %s)", (user_id,), commit=True)
            query("DELETE FROM Habits WHERE user_id = %s", (user_id,), commit=True)
            query("DELETE FROM Expenses WHERE user_id = %s", (user_id,), commit=True)
            query("DELETE FROM Budgets WHERE user_id = %s", (user_id,), commit=True)
            query("DELETE FROM User_Badges WHERE user_id = %s", (user_id,), commit=True)
            query("UPDATE Users SET points = 0 WHERE user_id = %s", (user_id,), commit=True)
        else:
            pwd = generate_password_hash("demo123")
            query("INSERT INTO Users (name, email, password_hash) VALUES (%s, %s, %s)", 
                  ("Demo User", email, pwd), commit=True)
            user_id = query("SELECT user_id FROM Users WHERE email = %s", (email,), fetch_one=True)['user_id']
            print(f"Created new demo user: {email} / demo123 (ID: {user_id})")

        # 2. Create Habits
        print("Creating habits...")
        habits_info = [
            ("Read 20 pages", "daily", "binary", 1, None),
            ("Drink Water (Glasses)", "daily", "count", 8, None),
            ("Gym / Workout", "weekly", "binary", 1, "0,2,4,6"), # Mon, Wed, Fri, Sun
            ("Meditate 10 mins", "daily", "binary", 1, None),
        ]
        
        habit_ids = {}
        for name, freq, htype, target, dow in habits_info:
            query("""
                INSERT INTO Habits (user_id, habit_name, frequency, habit_type, target_count, days_of_week)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, name, freq, htype, target, dow), commit=True)
            
            h_id = query("SELECT habit_id FROM Habits WHERE user_id = %s AND habit_name = %s", 
                         (user_id, name), fetch_one=True)['habit_id']
            habit_ids[name] = h_id

        # 3. Backfill Habit Logs (last 60 days)
        print("Backfilling 60 days of habit logs... (this might take a few seconds)")
        today = datetime.date.today()
        
        # We process day by day from oldest to newest so streaks and points calculate correctly via the triggers/procedures!
        for i in range(60, -1, -1):
            log_date = today - datetime.timedelta(days=i)
            # Oracle ISO week calculation mimics the backend
            
            for name, h_id in habit_ids.items():
                freq = [h[1] for h in habits_info if h[0] == name][0]
                htype = [h[2] for h in habits_info if h[0] == name][0]
                target = [h[3] for h in habits_info if h[0] == name][0]
                dow = [h[4] for h in habits_info if h[0] == name][0]
                
                # Should we log this today?
                if freq == "weekly":
                    dow_list = [int(x) for x in dow.split(",")]
                    # Python weekday: Mon=0, Sun=6
                    if log_date.weekday() not in dow_list:
                        continue
                
                # Probability of doing the habit
                success = random.random() < 0.75 # 75% success rate
                
                if success:
                    if htype == "binary":
                        status = 1
                        count = 1
                    else:
                        status = 1
                        count = target + random.randint(0, 2)
                        
                    query(
                        "sp_log_habit",
                        [h_id, log_date, status, count],
                        call_proc=True, commit=True
                    )

        # 4. Create Budgets
        print("Creating budgets...")
        this_month = today.strftime("%Y-%m")
        last_month = (today.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")
        categories = [("Food", 400), ("Transport", 150), ("Entertainment", 200)]
        for month in [last_month, this_month]:
            for cat, limit in categories:
                query("""
                    INSERT INTO Budgets (user_id, category, month_year, monthly_limit)
                    VALUES (%s, %s, %s, %s)
                """, (user_id, cat, month, limit), commit=True)

        # 5. Add Expenses (40 random expenses over last 45 days)
        print("Adding random expenses...")
        for _ in range(40):
            days_ago = random.randint(0, 45)
            exp_date = today - datetime.timedelta(days=days_ago)
            cat = random.choice([c[0] for c in categories])
            amount = round(random.uniform(10.0, 75.0), 2)
            
            # The expense trigger will automatically create budget alerts if they go over
            query("""
                INSERT INTO Expenses (user_id, category, amount, expense_date)
                VALUES (%s, %s, %s, %s)
            """, (user_id, cat, amount, exp_date), commit=True)

        print("\n=== SUCCESS ===")
        print(f"Demo account ready!")
        print(f"Email: demo@example.com")
        print(f"Password: demo123")

if __name__ == "__main__":
    generate_seed_data()
