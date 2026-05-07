import os
import sys

import pandas as pd

import Level_1
import Level_2
import Level_3

os.chdir(sys.path[0])

LEVEL_WEIGHTS = (0.35, 0.25, 0.40)


def normalize_score(score, max_score):
    if max_score == 0:
        return 0
    return round(min(score / max_score * 100, 100), 2)


def calc_final_score(
    level1_results: pd.DataFrame,
    level2_results: pd.DataFrame,
    level3_results: pd.DataFrame,
    weights: tuple = LEVEL_WEIGHTS,
) -> pd.DataFrame:
    final_results = level1_results.iloc[:, :3].copy()
    final_results["risk_score"] = (
        level1_results["normalized_score"] * weights[0]
        + level2_results["normalized_score"] * weights[1]
        + level3_results["normalized_score"] * weights[2]
    )
    return pd.DataFrame(final_results)


if __name__ == "__main__":
    excel_file = "output.xlsx"
    level1_results = Level_1.analyze_level1(excel_file)
    level2_results = Level_2.analyze_level2(excel_file)
    level3_results = Level_3.analyze_level3(excel_file)
    final_results = calc_final_score(level1_results, level2_results, level3_results)
    final_results.to_excel("final_analysis.xlsx", index=False)
