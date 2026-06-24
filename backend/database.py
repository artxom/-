import os
import logging
from sqlalchemy import create_engine, MetaData, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from sqlalchemy.dialects.postgresql.base import PGDialect

# Monkey patch to handle Huawei DWS (openGauss) custom version string
PGDialect._get_server_version_info = lambda *args: (9, 2)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DBConfig(BaseModel):
    host: str
    port: int = 8000
    user: str
    password: str
    dbname: str

class DatabaseManager:
    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self.metadata = MetaData()
    
    def connect(self, config: DBConfig):
        from sqlalchemy import URL
        url_object = URL.create(
            "postgresql",
            username=config.user,
            password=config.password,
            host=config.host,
            port=config.port,
            database=config.dbname,
        )
        try:
            self.engine = create_engine(url_object, pool_pre_ping=True)
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Successfully connected to DWS.")
            return True, "Success"
        except Exception as e:
            logger.error(f"Failed to connect to DWS: {e}")
            self.engine = None
            return False, str(e)
            
    def get_table_schema(self, table_name: str, schema: str = None) -> Optional[Dict[str, Any]]:
        if not self.engine:
            return None
        try:
            insp = inspect(self.engine)
            columns = insp.get_columns(table_name, schema=schema)
            pk = insp.get_pk_constraint(table_name, schema=schema)
            fks = insp.get_foreign_keys(table_name, schema=schema)
            return {
                "columns": [{"name": c["name"], "type": str(c["type"])} for c in columns],
                "primary_keys": pk.get("constrained_columns", []),
                "foreign_keys": [{"constrained_columns": fk["constrained_columns"], "referred_table": fk["referred_table"], "referred_schema": fk.get("referred_schema", schema), "referred_columns": fk["referred_columns"]} for fk in fks]
            }
        except SQLAlchemyError as e:
            logger.error(f"Error getting schema for {table_name} in {schema}: {e}")
            return None

    def get_schema_tree(self) -> Dict[str, List[str]]:
        if not self.engine:
            return {}
        try:
            insp = inspect(self.engine)
            schemas = insp.get_schema_names()
            tree = {}
            
            # Common system schemas to ignore
            system_schemas = {'information_schema', 'pg_catalog', 'pg_toast'}
            
            for sch in schemas:
                if sch in system_schemas or sch.startswith('pg_temp') or sch.startswith('pg_toast_temp'):
                    continue
                
                tables = insp.get_table_names(schema=sch)
                tree[sch] = tables
            return tree
        except SQLAlchemyError as e:
            logger.error(f"Error getting schema tree: {e}")
            return {}

    def get_table_relations(self, table_name: str, schema: str = None) -> Optional[Dict[str, Any]]:
        if not self.engine:
            return None
        try:
            insp = inspect(self.engine)
            fks = insp.get_foreign_keys(table_name, schema=schema)
            return {
                "schema": schema,
                "table": table_name,
                "foreign_keys": [{"constrained_columns": fk["constrained_columns"], "referred_table": fk["referred_table"], "referred_schema": fk.get("referred_schema", schema), "referred_columns": fk["referred_columns"]} for fk in fks]
            }
        except SQLAlchemyError as e:
            logger.error(f"Error getting relations for {table_name} in {schema}: {e}")
            return None

    def execute_query(self, sql: str, params: dict = None) -> List[Dict[str, Any]]:
        if not self.engine:
            raise Exception("Database not connected")
        
        sql_upper = sql.strip().upper()
        needs_autocommit = sql_upper.startswith("CREATE DATABASE") or sql_upper.startswith("DROP DATABASE") or sql_upper.startswith("VACUUM")
        
        if needs_autocommit:
            with self.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                result = conn.execute(text(sql), params or {})
                return [{"status": "success", "rowcount": result.rowcount}]
        else:
            with self.engine.connect() as conn:
                result = conn.execute(text(sql), params or {})
                if result.returns_rows:
                    return [dict(row._mapping) for row in result]
                else:
                    conn.commit()
                    return [{"status": "success", "rowcount": result.rowcount}]

db_manager = DatabaseManager()
