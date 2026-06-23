import sqlite3
import json
import os
from datetime import datetime

class KnowledgeBaseManager:
    def __init__(self, db_path="knowledge.db", json_path="knowledge.json"):
        self.db_path = db_path
        self.json_path = json_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()

    def add_knowledge(self, contents: list[str]):
        if not contents:
            return
            
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        for content in contents:
            cursor.execute('''
                INSERT INTO knowledge (content, created_at)
                VALUES (?, ?)
            ''', (content, datetime.now().isoformat()))
            
        conn.commit()
        conn.close()
        self._sync_to_json()

    def get_all_knowledge(self) -> list[dict]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT id, content, created_at FROM knowledge ORDER BY created_at DESC')
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]

    def update_knowledge(self, knowledge_id: int, new_content: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('UPDATE knowledge SET content = ? WHERE id = ?', (new_content, knowledge_id))
        conn.commit()
        conn.close()
        self._sync_to_json()

    def delete_knowledge(self, knowledge_id: int):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM knowledge WHERE id = ?', (knowledge_id,))
        conn.commit()
        conn.close()
        self._sync_to_json()

    def _sync_to_json(self):
        knowledge_list = self.get_all_knowledge()
        with open(self.json_path, 'w', encoding='utf-8') as f:
            json.dump(knowledge_list, f, ensure_ascii=False, indent=2)

memory_manager = KnowledgeBaseManager()
