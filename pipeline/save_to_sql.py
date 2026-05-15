import json
import os
import re
import uuid
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text


DEFAULT_RESULT_TABLE = "bot_detection_results"
DEFAULT_RULE_HIT_TABLE = "bot_rule_hits"
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def load_env_file(path: str):
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            os.environ.setdefault(key, value)


def load_project_env():
    load_env_file(os.path.join(PROJECT_ROOT, ".env"))
    load_env_file(os.path.join(os.path.dirname(__file__), ".env"))


load_project_env()


def get_mysql_url() -> str:
    """Build the MySQL connection URL from environment variables."""
    if os.getenv("ANTIBOT_DB_URL"):
        return os.environ["ANTIBOT_DB_URL"]

    user = os.getenv("ANTIBOT_DB_USER", "root")
    password = os.getenv("ANTIBOT_DB_PASSWORD", "")
    host = os.getenv("ANTIBOT_DB_HOST", "localhost")
    port = os.getenv("ANTIBOT_DB_PORT", "3306")
    database = os.getenv("ANTIBOT_DB_NAME", "anti_bot")
    charset = os.getenv("ANTIBOT_DB_CHARSET", "utf8mb4")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset={charset}"


def get_engine(mysql_url: Optional[str] = None):
    return create_engine(mysql_url or get_mysql_url())


def quote_identifier(identifier: str) -> str:
    if not IDENTIFIER_PATTERN.match(identifier):
        raise ValueError(f"invalid SQL identifier: {identifier}")
    return f"`{identifier}`"


def ensure_column(conn, table: str, column: str, definition: str):
    exists = conn.execute(text("""
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = :table
          AND COLUMN_NAME = :column
    """), {"table": table, "column": column}).scalar()

    if not exists:
        conn.execute(text(
            f"ALTER TABLE {quote_identifier(table)} ADD COLUMN {quote_identifier(column)} {definition}"
        ))


def _json_dumps(value):
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _normalise_scalar(value):
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if pd.isna(value):
        return None
    return value


def ensure_result_tables(
    engine,
    result_table: str = DEFAULT_RESULT_TABLE,
    rule_hit_table: str = DEFAULT_RULE_HIT_TABLE,
):
    result_table_sql = quote_identifier(result_table)
    rule_hit_table_sql = quote_identifier(rule_hit_table)

    with engine.begin() as conn:
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {result_table_sql} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                save_batch_id VARCHAR(36) NOT NULL,
                event_id BIGINT NULL,
                user_name VARCHAR(128) NULL,
                user_ip VARCHAR(45) NULL,
                user_agent TEXT NULL,
                event_time DATETIME NULL,
                detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                level1_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                level2_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                level3_score DECIMAL(5,2) NOT NULL DEFAULT 0,
                level1_raw_score DECIMAL(8,2) NOT NULL DEFAULT 0,
                level2_raw_score DECIMAL(8,2) NOT NULL DEFAULT 0,
                level3_raw_score DECIMAL(8,2) NOT NULL DEFAULT 0,
                risk_score DECIMAL(5,2) NOT NULL DEFAULT 0,

                risk_level VARCHAR(32) NOT NULL,
                suggested_action VARCHAR(32) NOT NULL,
                level1_reasons TEXT NULL,
                level2_reasons TEXT NULL,
                level3_reasons TEXT NULL,
                all_reasons JSON NULL,
                all_rule_hits JSON NULL,

                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                INDEX idx_event_id (event_id),
                INDEX idx_save_batch_id (save_batch_id),
                INDEX idx_user_name_time (user_name, event_time),
                INDEX idx_user_ip_time (user_ip, event_time),
                INDEX idx_risk_score (risk_score),
                INDEX idx_risk_level (risk_level)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """))

        ensure_column(conn, result_table, "user_agent", "TEXT NULL AFTER `user_ip`")

        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {rule_hit_table_sql} (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                result_id BIGINT NOT NULL,
                event_id BIGINT NULL,
                user_name VARCHAR(128) NULL,
                user_ip VARCHAR(45) NULL,
                level TINYINT NOT NULL,
                rule_code VARCHAR(128) NOT NULL,
                rule_name VARCHAR(255) NULL,
                weight DECIMAL(8,2) NULL,
                reason TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                INDEX idx_result_id (result_id),
                INDEX idx_event_id (event_id),
                INDEX idx_level_rule (level, rule_code),
                INDEX idx_user_ip (user_ip)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """))


def _build_result_rows(final_results: pd.DataFrame) -> pd.DataFrame:
    rows = final_results.copy()
    rows = rows.rename(columns={"timestamp": "event_time"})

    if "event_time" in rows.columns:
        rows["event_time"] = pd.to_datetime(rows["event_time"], errors="coerce")

    for column in ("all_reasons", "all_rule_hits"):
        if column in rows.columns:
            rows[column] = rows[column].apply(_json_dumps)

    wanted_columns = [
        "event_id",
        "user_name",
        "user_ip",
        "user_agent",
        "event_time",
        "level1_score",
        "level2_score",
        "level3_score",
        "level1_raw_score",
        "level2_raw_score",
        "level3_raw_score",
        "risk_score",
        "risk_level",
        "suggested_action",
        "level1_reasons",
        "level2_reasons",
        "level3_reasons",
        "all_reasons",
        "all_rule_hits",
    ]

    for column in wanted_columns:
        if column not in rows.columns:
            rows[column] = None

    return rows[wanted_columns]


def _build_rule_hit_rows(
    final_results: pd.DataFrame,
    result_ids: list,
) -> list[dict]:
    rows = []
    for (_, result), result_id in zip(final_results.iterrows(), result_ids):
        event_id = _normalise_scalar(result.get("event_id"))
        user_name = _normalise_scalar(result.get("user_name"))
        user_ip = _normalise_scalar(result.get("user_ip"))

        for hit in result.get("all_rule_hits", []) or []:
            rows.append({
                "result_id": result_id,
                "event_id": event_id,
                "user_name": user_name,
                "user_ip": user_ip,
                "level": hit.get("level"),
                "rule_code": hit.get("rule_code"),
                "rule_name": hit.get("rule_name"),
                "weight": hit.get("weight"),
                "reason": hit.get("reason"),
            })
    return rows


def save_detection_results_to_mysql(
    final_results: pd.DataFrame,
    mysql_url: Optional[str] = None,
    result_table: str = DEFAULT_RESULT_TABLE,
    rule_hit_table: str = DEFAULT_RULE_HIT_TABLE,
    create_tables: bool = True,
    save_batch_id: Optional[str] = None,
) -> dict:
    quote_identifier(result_table)
    quote_identifier(rule_hit_table)

    engine = get_engine(mysql_url)
    if create_tables:
        ensure_result_tables(engine, result_table, rule_hit_table)

    result_rows = _build_result_rows(final_results)
    save_batch_id = save_batch_id or str(uuid.uuid4())
    result_rows.insert(0, "save_batch_id", save_batch_id)

    with engine.begin() as conn:
        result_rows.to_sql(result_table, conn, if_exists="append", index=False, method="multi")
        saved = conn.execute(text(f"""
            SELECT id
            FROM {quote_identifier(result_table)}
            WHERE save_batch_id = :save_batch_id
            ORDER BY id DESC
            LIMIT :row_count
        """), {
            "save_batch_id": save_batch_id,
            "row_count": len(result_rows),
        }).scalars().all()
        saved = list(reversed(saved))
        if len(saved) != len(result_rows):
            raise RuntimeError(
                "failed to resolve inserted result ids: "
                f"expected {len(result_rows)}, got {len(saved)}"
            )

        rule_hit_rows = _build_rule_hit_rows(final_results.reset_index(drop=True), saved)
        if rule_hit_rows:
            pd.DataFrame(rule_hit_rows).to_sql(rule_hit_table, conn, if_exists="append", index=False, method="multi")

    return {
        "result_table": result_table,
        "rule_hit_table": rule_hit_table,
        "save_batch_id": save_batch_id,
        "result_rows": len(result_rows),
        "rule_hit_rows": len(rule_hit_rows),
    }
