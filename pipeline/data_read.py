import json
import os
from typing import Iterator, Optional

import pandas as pd
from sqlalchemy import create_engine, text

from pipeline.save_to_sql import get_mysql_url, quote_identifier


def get_source_table() -> str:
    return os.getenv("ANTIBOT_SOURCE_TABLE", "fingerprints_sample")


def get_source_json_field() -> str:
    return os.getenv("ANTIBOT_SOURCE_JSON_FIELD", "rest_json")


def get_batch_size() -> int:
    return int(os.getenv("ANTIBOT_BATCH_SIZE", "10000"))


def build_source_select_sql(
    table: str,
    json_column: str,
    where_sql: str = "",
    limit_sql: str = "",
) -> str:
    table_sql = quote_identifier(table)
    json_column_sql = quote_identifier(json_column)
    return f"""
        SELECT
            `id`,
            `username`,
            `url`,
            `delta_time`,
            `click_time`,
            `click_time` AS `timestamp`,
            NULL AS `ip`,
            `cookie_hash`,
            `canvas_hash`,
            `webgl_hash`,
            `fonts_hash`,
            `user_agent`,
            {json_column_sql} AS `json_field`,
            `created_at`
        FROM {table_sql}
        {where_sql}
        ORDER BY `id`
        {limit_sql}
    """


def read_data_from_mysql(
    mysql_url: Optional[str] = None,
    source_table: Optional[str] = None,
    json_field: Optional[str] = None,
    limit: Optional[int] = None,
    after_id: Optional[int] = None,
) -> pd.DataFrame:
    engine = create_engine(mysql_url or get_mysql_url())
    table = source_table or get_source_table()
    json_column = json_field or get_source_json_field()

    params = {}
    where_sql = ""
    if after_id is not None:
        where_sql = "WHERE `id` > :after_id"
        params["after_id"] = int(after_id)

    limit_sql = ""
    if limit is not None:
        limit_sql = "LIMIT :limit"
        params["limit"] = int(limit)

    sql = build_source_select_sql(table, json_column, where_sql, limit_sql)
    return pd.read_sql(text(sql), engine, params=params)


def read_data_from_mysql_batches(
    mysql_url: Optional[str] = None,
    source_table: Optional[str] = None,
    json_field: Optional[str] = None,
    batch_size: Optional[int] = None,
    start_after_id: int = 0,
    max_rows: Optional[int] = None,
) -> Iterator[pd.DataFrame]:
    engine = create_engine(mysql_url or get_mysql_url())
    table = source_table or get_source_table()
    json_column = json_field or get_source_json_field()
    size = int(batch_size or get_batch_size())
    if size <= 0:
        raise ValueError("batch_size must be greater than 0")

    last_id = int(start_after_id or 0)
    rows_read = 0

    while True:
        remaining = None if max_rows is None else int(max_rows) - rows_read
        if remaining is not None and remaining <= 0:
            break

        current_limit = size if remaining is None else min(size, remaining)
        sql = build_source_select_sql(
            table,
            json_column,
            "WHERE `id` > :last_id",
            "LIMIT :limit",
        )
        df = pd.read_sql(
            text(sql),
            engine,
            params={"last_id": last_id, "limit": current_limit},
        )

        if df.empty:
            break

        yield df

        last_id = int(df["id"].max())
        rows_read += len(df)


def build_signal_key(parent_key, signal_key, sep="_"):
    return f"{parent_key}{sep}{signal_key}" if parent_key else signal_key


def _flatten_mapping(data, parent_key=""):
    flattened = {}
    if not isinstance(data, dict):
        return flattened

    for key, value in data.items():
        signal_key = build_signal_key(parent_key, key)
        if isinstance(value, dict):
            flattened.update(_flatten_mapping(value, signal_key))
        else:
            flattened[signal_key] = value

    return flattened


def _first_mapping(record, *keys):
    for key in keys:
        value = record.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _parse_json_payload(payload):
    if isinstance(payload, dict):
        return payload
    if payload is None or (isinstance(payload, float) and pd.isna(payload)):
        return {}
    if isinstance(payload, str):
        payload = payload.strip()
        if not payload:
            return {}
        return json.loads(payload)
    return {}


def flatten_json(json_data):
    rows = []
    for record in json_data:
        row = {}

        signal_groups = {
            "level1": _first_mapping(record, "leve1", "level1", "level1Signals"),
            "level2": _first_mapping(record, "leve2", "level2", "level2Signals"),
            "level3": _first_mapping(record, "level3", "level3Signals"),
            "keyboard": _first_mapping(record, "keyboard"),
            "mousemove": _first_mapping(record, "mousemove"),
            "llmNature": _first_mapping(record, "llmNature"),
        }

        for prefix, signals in signal_groups.items():
            for key, value in _flatten_mapping(signals).items():
                row[build_signal_key(prefix, key)] = value

        for key in ("username", "version"):
            if key in record:
                row[build_signal_key("payload", key)] = record[key]

        rows.append(row)
    return pd.DataFrame(rows)


def parse_data(df: pd.DataFrame) -> pd.DataFrame:
    base_columns = [
        column for column in [
            "id",
            "username",
            "timestamp",
            "ip",
            "url",
            "delta_time",
            "click_time",
            "created_at",
            "cookie_hash",
            "canvas_hash",
            "webgl_hash",
            "fonts_hash",
            "user_agent",
        ] if column in df.columns
    ]
    base_df = df[base_columns].copy()

    if "json_field" not in df.columns:
        raise ValueError("input dataframe must contain a json_field column")

    parsed_payloads = df["json_field"].apply(_parse_json_payload).tolist()
    signal_df = flatten_json(parsed_payloads)
    return pd.concat([base_df.reset_index(drop=True), signal_df.reset_index(drop=True)], axis=1)


if __name__ == "__main__":
    df_mysql = read_data_from_mysql()
    df_parsed = parse_data(df_mysql)
    print(df_parsed.head())
