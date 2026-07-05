import sqlite3
import uuid
import os
from typing import List, Dict, Any
from datetime import datetime

class RAGManager:
    def __init__(self, db_path="knowledge_base.sqlite"):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self):
        # We use check_same_thread=False because FastAPI handles connections concurrently,
        # but SQLite handles concurrency safely as long as we don't hold long write locks.
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # 基础表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_docs (
                    id TEXT PRIMARY KEY,
                    content TEXT,
                    target TEXT,
                    created_at TEXT
                )
            """)
            # FTS5 虚拟表，使用 unicode61 分词器以更好支持中文和英文符号
            cursor.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                    content,
                    target,
                    content="knowledge_docs",
                    content_rowid="rowid",
                    tokenize="unicode61"
                )
            """)
            
            # 触发器：自动同步数据到 FTS 表 (INSERT)
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge_docs BEGIN
                    INSERT INTO knowledge_fts(rowid, content, target) 
                    VALUES (new.rowid, new.content, new.target);
                END;
            """)
            # 触发器：自动同步数据到 FTS 表 (DELETE)
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge_docs BEGIN
                    INSERT INTO knowledge_fts(knowledge_fts, rowid, content, target) 
                    VALUES('delete', old.rowid, old.content, old.target);
                END;
            """)
            # 触发器：自动同步数据到 FTS 表 (UPDATE)
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge_docs BEGIN
                    INSERT INTO knowledge_fts(knowledge_fts, rowid, content, target) 
                    VALUES('delete', old.rowid, old.content, old.target);
                    INSERT INTO knowledge_fts(rowid, content, target) 
                    VALUES (new.rowid, new.content, new.target);
                END;
            """)
            conn.commit()

    def add_knowledge(self, contents: List[str], metadatas: List[Dict[str, Any]] = None):
        if not contents:
            return
            
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        with self._get_conn() as conn:
            cursor = conn.cursor()
            for i, content in enumerate(contents):
                meta = metadatas[i] if metadatas and i < len(metadatas) else {}
                doc_id = str(uuid.uuid4())
                target = meta.get("target", "")
                created_at = meta.get("created_at", now)
                
                cursor.execute(
                    "INSERT INTO knowledge_docs (id, content, target, created_at) VALUES (?, ?, ?, ?)",
                    (doc_id, content, target, created_at)
                )
            conn.commit()

    def search_knowledge(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        if not query.strip():
            return []
            
        # 预处理查询词：将查询中的空格或特殊符号转换为 FTS 支持的查询格式 (OR 连接或者逐字匹配)
        # 简单起见，我们将查询包裹在双引号中进行短语匹配，或者将多个词用 OR 连接
        # 为了应对 SQL 生成场景，直接按原样加上 * 通配符进行匹配效果较好
        safe_query = query.replace('"', '""').replace("'", "''")
        
        # 采用 FTS5 的 BM25 算法计算相关性评分
        sql = """
            SELECT d.id, d.content, d.target, d.created_at, bm25(knowledge_fts) as score
            FROM knowledge_fts f
            JOIN knowledge_docs d ON f.rowid = d.rowid
            WHERE knowledge_fts MATCH ?
            ORDER BY score LIMIT ?
        """
        
        # 构造 match 查询: 使用多个关键词的隐式 AND/OR，这里简单将 query 变成一个短语或通配符匹配
        # 将句子拆分为简单的字块进行模糊匹配
        terms = [t for t in safe_query.split() if t]
        if not terms:
            match_str = f'"{safe_query}"'
        else:
            match_str = " OR ".join([f'"{t}"*' for t in terms])
        
        formatted_results = []
        try:
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, (match_str, top_k))
                rows = cursor.fetchall()
                
                for row in rows:
                    meta = {
                        "target": row["target"],
                        "created_at": row["created_at"]
                    }
                    formatted_results.append({
                        "id": row["id"],
                        "content": row["content"],
                        "metadata": meta,
                        "distance": row["score"]  # BM25 score (smaller is usually better in SQLite BM25, actually it's more negative is better! SQLite bm25 returns negative values for better matches)
                    })
        except Exception as e:
            # 如果 FTS 语法解析失败（比如用户输入了特殊符号），降级为简单的 LIKE 模糊查询
            fallback_sql = """
                SELECT id, content, target, created_at
                FROM knowledge_docs
                WHERE content LIKE ? OR target LIKE ?
                LIMIT ?
            """
            like_str = f"%{safe_query}%"
            with self._get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(fallback_sql, (like_str, like_str, top_k))
                rows = cursor.fetchall()
                for row in rows:
                    meta = {
                        "target": row["target"],
                        "created_at": row["created_at"]
                    }
                    formatted_results.append({
                        "id": row["id"],
                        "content": row["content"],
                        "metadata": meta,
                        "distance": -1.0 # mock score
                    })

        return formatted_results

    def get_all_knowledge(self) -> List[Dict[str, Any]]:
        formatted_results = []
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, content, target, created_at FROM knowledge_docs ORDER BY created_at DESC")
            rows = cursor.fetchall()
            for row in rows:
                meta = {
                    "target": row["target"],
                    "created_at": row["created_at"]
                }
                formatted_results.append({
                    "id": row["id"],
                    "content": row["content"],
                    "target": row["target"],
                    "created_at": row["created_at"],
                    "metadata": meta
                })
        return formatted_results

    def update_knowledge(self, doc_id: str, new_content: str, metadata: Dict[str, Any] = None):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if metadata and "target" in metadata:
                cursor.execute(
                    "UPDATE knowledge_docs SET content = ?, target = ? WHERE id = ?",
                    (new_content, metadata["target"], doc_id)
                )
            else:
                cursor.execute(
                    "UPDATE knowledge_docs SET content = ? WHERE id = ?",
                    (new_content, doc_id)
                )
            conn.commit()

    def delete_knowledge(self, doc_id: str):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM knowledge_docs WHERE id = ?", (doc_id,))
            conn.commit()

rag_manager = RAGManager()
