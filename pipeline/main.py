import os
import uuid

import pandas as pd

from pipeline.data_read import parse_data, read_data_from_mysql, read_data_from_mysql_batches
from pipeline.levels.level_1 import analyze_level1
from pipeline.levels.level_2 import analyze_level2
from pipeline.levels.level_3 import analyze_level3
from pipeline.save_to_sql import save_detection_results_to_mysql
from pipeline.score import calc_final_score


def _analyze_raw_batch(df_tmp: pd.DataFrame) -> pd.DataFrame:
    df = parse_data(df_tmp)
    level1_results = analyze_level1(df)
    level2_results = analyze_level2(df)
    level3_results = analyze_level3(df)
    return calc_final_score(level1_results, level2_results, level3_results)


def _get_env_int(name: str, default: int | None = None) -> int | None:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


def _get_result_table() -> str:
    return os.getenv("ANTIBOT_RESULT_TABLE", "bot_detection_results")


def _get_rule_hit_table() -> str:
    return os.getenv("ANTIBOT_RULE_HIT_TABLE", "bot_rule_hits")


def _print_save_summary(save_summary: dict):
    print(
        "saved detection results to MySQL: "
        f"{save_summary['result_rows']} result rows, "
        f"{save_summary['rule_hit_rows']} rule hit rows, "
        f"batch={save_summary['save_batch_id']}"
    )


def _run_single_batch(output_file=None, save_mysql=True, limit=None):
    df_tmp = read_data_from_mysql(limit=limit)
    final_results = _analyze_raw_batch(df_tmp)

    if save_mysql:
        save_summary = save_detection_results_to_mysql(
            final_results,
            result_table=_get_result_table(),
            rule_hit_table=_get_rule_hit_table(),
        )
        _print_save_summary(save_summary)

    if output_file:
        final_results.to_excel(output_file, index=False)

    return final_results


def main(output_file=None, save_mysql=True, batch_size=None, max_rows=None):
    batch_size = batch_size if batch_size is not None else _get_env_int("ANTIBOT_BATCH_SIZE", 10000)
    max_rows = max_rows if max_rows is not None else _get_env_int("ANTIBOT_MAX_ROWS")

    if not batch_size or batch_size <= 0:
        return _run_single_batch(output_file=output_file, save_mysql=save_mysql, limit=max_rows)

    save_batch_id = str(uuid.uuid4())
    result_frames = []
    collect_results = bool(output_file) or not save_mysql
    total_result_rows = 0
    total_rule_hit_rows = 0
    chunk_count = 0

    for chunk_count, df_tmp in enumerate(
        read_data_from_mysql_batches(batch_size=batch_size, max_rows=max_rows),
        start=1,
    ):
        final_results = _analyze_raw_batch(df_tmp)
        total_result_rows += len(final_results)

        save_summary = None
        if save_mysql:
            save_summary = save_detection_results_to_mysql(
                final_results,
                result_table=_get_result_table(),
                rule_hit_table=_get_rule_hit_table(),
                create_tables=chunk_count == 1,
                save_batch_id=save_batch_id,
            )
            total_rule_hit_rows += save_summary["rule_hit_rows"]

        if collect_results:
            result_frames.append(final_results)

        min_id = int(df_tmp["id"].min())
        max_id = int(df_tmp["id"].max())
        message = (
            f"processed batch {chunk_count}: source id {min_id}-{max_id}, "
            f"{len(df_tmp)} source rows, {len(final_results)} result rows"
        )
        if save_summary:
            message += f", {save_summary['rule_hit_rows']} rule hit rows"
        print(message)

    if output_file:
        all_results = pd.concat(result_frames, ignore_index=True) if result_frames else pd.DataFrame()
        all_results.to_excel(output_file, index=False)

    if save_mysql:
        print(
            "saved detection results to MySQL in batches: "
            f"{total_result_rows} result rows, "
            f"{total_rule_hit_rows} rule hit rows, "
            f"{chunk_count} batches, "
            f"batch={save_batch_id}"
        )

    if collect_results:
        return pd.concat(result_frames, ignore_index=True) if result_frames else pd.DataFrame()

    return {
        "save_batch_id": save_batch_id,
        "batches": chunk_count,
        "result_rows": total_result_rows,
        "rule_hit_rows": total_rule_hit_rows,
    }


if __name__ == "__main__":
    main()
