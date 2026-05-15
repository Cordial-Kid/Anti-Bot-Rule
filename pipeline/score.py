import pandas as pd

LEVEL_WEIGHTS = (0.35, 0.25, 0.40)


def normalize_score(score, max_score):
    if max_score == 0:
        return 0
    return round(min(score / max_score * 100, 100), 2)


def classify_risk(score):
    if score < 25:
        return "low", "allow"
    if score < 45:
        return "suspicious", "observe"
    if score < 65:
        return "medium_high", "challenge"
    return "high", "block"


def get_series(df, column, default=""):
    if column in df.columns:
        return df[column].reset_index(drop=True)
    return pd.Series([default] * len(df))


def combine_reasons(*reasons):
    return [
        reason
        for reason in reasons
        if isinstance(reason, str) and reason and reason != "looks normal"
    ]


def combine_rule_hits(*hits_groups):
    combined = []
    for hits in hits_groups:
        if isinstance(hits, list):
            combined.extend(hits)
    return combined


def calc_final_score(
    level1_results: pd.DataFrame,
    level2_results: pd.DataFrame,
    level3_results: pd.DataFrame,
    weights: tuple = LEVEL_WEIGHTS,
) -> pd.DataFrame:
    level1_results = level1_results.reset_index(drop=True)
    level2_results = level2_results.reset_index(drop=True)
    level3_results = level3_results.reset_index(drop=True)

    final_results = pd.DataFrame({
        "event_id": get_series(level1_results, "event_id"),
        "user_name": get_series(level1_results, "user_name"),
        "timestamp": get_series(level1_results, "timestamp"),
        "user_ip": get_series(level1_results, "user_ip"),
        "user_agent": get_series(level1_results, "user_agent"),
        "level1_score": get_series(level1_results, "normalized_score", 0),
        "level2_score": get_series(level2_results, "normalized_score", 0),
        "level3_score": get_series(level3_results, "normalized_score", 0),
        "level1_raw_score": get_series(level1_results, "raw_score", 0),
        "level2_raw_score": get_series(level2_results, "raw_score", 0),
        "level3_raw_score": get_series(level3_results, "raw_score", 0),
        "level1_reasons": get_series(level1_results, "reasons"),
        "level2_reasons": get_series(level2_results, "reasons"),
        "level3_reasons": get_series(level3_results, "reasons"),
    })

    final_results["risk_score"] = round(
        final_results["level1_score"] * weights[0]
        + final_results["level2_score"] * weights[1]
        + final_results["level3_score"] * weights[2],
        2,
    )

    risk_info = final_results["risk_score"].apply(classify_risk)
    final_results["risk_level"] = risk_info.apply(lambda item: item[0])
    final_results["suggested_action"] = risk_info.apply(lambda item: item[1])

    final_results["all_reasons"] = [
        combine_reasons(level1_reason, level2_reason, level3_reason)
        for level1_reason, level2_reason, level3_reason in zip(
            final_results["level1_reasons"],
            final_results["level2_reasons"],
            final_results["level3_reasons"],
        )
    ]
    final_results["all_rule_hits"] = [
        combine_rule_hits(level1_hits, level2_hits, level3_hits)
        for level1_hits, level2_hits, level3_hits in zip(
            get_series(level1_results, "rule_hits", []),
            get_series(level2_results, "rule_hits", []),
            get_series(level3_results, "rule_hits", []),
        )
    ]

    return pd.DataFrame(final_results)
