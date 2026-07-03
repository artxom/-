import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

class SessionManager:
    def __init__(self, db_path="sessions.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                history_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()

    def create_or_update_session(self, session_id: str, title: str, history: List[Dict[str, Any]]) -> str:
        if not session_id:
            session_id = str(uuid.uuid4())
            
        history_str = json.dumps(history, ensure_ascii=False)
        updated_at = datetime.now().isoformat()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM chat_sessions WHERE id = ?', (session_id,))
        if cursor.fetchone():
            cursor.execute('''
                UPDATE chat_sessions 
                SET title = ?, history_json = ?, updated_at = ?
                WHERE id = ?
            ''', (title, history_str, updated_at, session_id))
        else:
            cursor.execute('''
                INSERT INTO chat_sessions (id, title, history_json, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (session_id, title, history_str, updated_at))
            
        conn.commit()
        conn.close()
        return session_id

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT id, title, updated_at FROM chat_sessions ORDER BY updated_at DESC')
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT id, title, history_json, updated_at FROM chat_sessions WHERE id = ?', (session_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            data = dict(row)
            data['history'] = json.loads(data['history_json'])
            del data['history_json']
            return data
        return None

    def delete_session(self, session_id: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
        conn.commit()
        conn.close()

session_manager = SessionManager()
