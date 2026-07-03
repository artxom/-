import sqlite3
from typing import List, Dict, Any, Optional

class LineageManager:
    def __init__(self, db_path="lineage.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lineage_tables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schema_name TEXT NOT NULL,
                table_name TEXT NOT NULL,
                description TEXT,
                UNIQUE(schema_name, table_name)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lineage_columns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_id INTEGER NOT NULL,
                column_name TEXT NOT NULL,
                data_type TEXT,
                description TEXT,
                FOREIGN KEY (table_id) REFERENCES lineage_tables(id),
                UNIQUE(table_id, column_name)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS lineage_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_col_id INTEGER NOT NULL,
                target_col_id INTEGER NOT NULL,
                transform_logic TEXT,
                FOREIGN KEY (source_col_id) REFERENCES lineage_columns(id),
                FOREIGN KEY (target_col_id) REFERENCES lineage_columns(id),
                UNIQUE(source_col_id, target_col_id)
            )
        ''')
        
        conn.commit()
        conn.close()

    def add_table(self, schema_name: str, table_name: str, description: str = "") -> int:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO lineage_tables (schema_name, table_name, description)
                VALUES (?, ?, ?)
            ''', (schema_name, table_name, description))
            table_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            cursor.execute('SELECT id FROM lineage_tables WHERE schema_name = ? AND table_name = ?', (schema_name, table_name))
            table_id = cursor.fetchone()[0]
            if description:
                cursor.execute('UPDATE lineage_tables SET description = ? WHERE id = ?', (description, table_id))
        conn.commit()
        conn.close()
        return table_id

    def add_column(self, table_id: int, column_name: str, data_type: str = "", description: str = "") -> int:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO lineage_columns (table_id, column_name, data_type, description)
                VALUES (?, ?, ?, ?)
            ''', (table_id, column_name, data_type, description))
            col_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            cursor.execute('SELECT id FROM lineage_columns WHERE table_id = ? AND column_name = ?', (table_id, column_name))
            col_id = cursor.fetchone()[0]
        conn.commit()
        conn.close()
        return col_id

    def add_edge(self, source_col_id: int, target_col_id: int, transform_logic: str = "") -> int:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO lineage_edges (source_col_id, target_col_id, transform_logic)
                VALUES (?, ?, ?)
            ''', (source_col_id, target_col_id, transform_logic))
            edge_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            cursor.execute('SELECT id FROM lineage_edges WHERE source_col_id = ? AND target_col_id = ?', (source_col_id, target_col_id))
            edge_id = cursor.fetchone()[0]
            if transform_logic:
                cursor.execute('UPDATE lineage_edges SET transform_logic = ? WHERE id = ?', (transform_logic, edge_id))
        conn.commit()
        conn.close()
        return edge_id

    def get_column_id(self, schema_name: str, table_name: str, column_name: str) -> Optional[int]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.id FROM lineage_columns c
            JOIN lineage_tables t ON c.table_id = t.id
            WHERE t.schema_name = ? AND t.table_name = ? AND c.column_name = ?
        ''', (schema_name, table_name, column_name))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None

    def get_column_info(self, col_id: int) -> Optional[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT t.schema_name, t.table_name, c.column_name, c.data_type, c.description
            FROM lineage_columns c
            JOIN lineage_tables t ON c.table_id = t.id
            WHERE c.id = ?
        ''', (col_id,))
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_upstream(self, col_id: int) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT e.source_col_id, e.transform_logic, t.schema_name, t.table_name, c.column_name
            FROM lineage_edges e
            JOIN lineage_columns c ON e.source_col_id = c.id
            JOIN lineage_tables t ON c.table_id = t.id
            WHERE e.target_col_id = ?
        ''', (col_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def get_downstream(self, col_id: int) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT e.target_col_id, e.transform_logic, t.schema_name, t.table_name, c.column_name
            FROM lineage_edges e
            JOIN lineage_columns c ON e.target_col_id = c.id
            JOIN lineage_tables t ON c.table_id = t.id
            WHERE e.source_col_id = ?
        ''', (col_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]

lineage_manager = LineageManager()
