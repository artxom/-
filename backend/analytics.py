import sqlite3
from datetime import datetime

class AnalyticsManager:
    def __init__(self, db_path="analytics.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER
            )
        ''')
        conn.commit()
        conn.close()

    def log_session(self, prompt_tokens: int, completion_tokens: int):
        total = prompt_tokens + completion_tokens
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO usage_stats (created_at, prompt_tokens, completion_tokens, total_tokens)
            VALUES (?, ?, ?, ?)
        ''', (datetime.now().isoformat(), prompt_tokens, completion_tokens, total))
        conn.commit()
        conn.close()

    def get_daily_stats(self) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT substr(created_at, 1, 10) as date, 
                   COUNT(*) as sessions, 
                   SUM(total_tokens) as tokens 
            FROM usage_stats 
            GROUP BY date 
            ORDER BY date DESC
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_today_hourly_stats(self) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        cursor.execute('''
            SELECT created_at, total_tokens
            FROM usage_stats
            WHERE created_at LIKE ?
        ''', (f"{today_str}%",))
        
        rows = cursor.fetchall()
        conn.close()
        
        buckets = [
            {"label": "00:00-03:00", "sessions": 0, "tokens": 0},
            {"label": "03:00-06:00", "sessions": 0, "tokens": 0},
            {"label": "06:00-09:00", "sessions": 0, "tokens": 0},
            {"label": "09:00-12:00", "sessions": 0, "tokens": 0},
            {"label": "12:00-15:00", "sessions": 0, "tokens": 0},
            {"label": "15:00-18:00", "sessions": 0, "tokens": 0},
            {"label": "18:00-21:00", "sessions": 0, "tokens": 0},
            {"label": "21:00-24:00", "sessions": 0, "tokens": 0},
        ]
        
        for row in rows:
            dt = datetime.fromisoformat(row['created_at'])
            hour = dt.hour
            bucket_idx = hour // 3
            if 0 <= bucket_idx < 8:
                buckets[bucket_idx]["sessions"] += 1
                buckets[bucket_idx]["tokens"] += row['total_tokens']
                
        return buckets

analytics_manager = AnalyticsManager()
