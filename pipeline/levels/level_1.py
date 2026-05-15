# Level 1: Basic Usability check
import pandas as pd

from pipeline import data_read, score
from pipeline.levels.utils import add_rule_hit, is_missing, to_bool, to_int, to_list

LEVEL1_REQUIRED_FIELDS = [
    "level1_webdriver",
    "level1_pluginsLength",
    "level1_languages",
    "level1_mimeTypesLength",
    "level1_hardwareConcurrency",
    "level1_outerVsScreenWidth",
    "level1_userAgent"
]

MAX_LEVEL1_SCORE = 100
WEIGHT_LEVEL1_MISSING = 35
WEIGHT_WEBDRIVER = 50
WEIGHT_HEADLESS_UA = 50
WEIGHT_PLUGIN_OR_MIME_MISSING = 10
WEIGHT_LANGUAGES_MISSING = 10
WEIGHT_HARDWARE_ZERO = 20
WEIGHT_HARDWARE_TOO_LARGE = 10
WEIGHT_WINDOW_WIDTH_ABNORMAL = 8
WEIGHT_UA_MISSING_OR_SHORT = 20

def analyze_level1(df):
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        reasons = []
        rule_hits = []
        risk_score = 0
        max_score = MAX_LEVEL1_SCORE

        missing_fields = [
            field for field in LEVEL1_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL1_REQUIRED_FIELDS)

        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL1_MISSING
            reason = "many missing fields in level 1 signals"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "level1_many_missing_fields", "Many missing Level 1 signals", WEIGHT_LEVEL1_MISSING, reason)

            results.append({
                "event_id": getattr(row, "id", ""),
                "user_name": getattr(row, "username", ""),
                "timestamp": getattr(row, "timestamp", ""),
                "user_ip": getattr(row, "ip", ""),
                "user_agent": getattr(row, "user_agent", ""),
                "raw_score": risk_score,
                "normalized_score": score.normalize_score(risk_score, max_score),
                "reasons": "; ".join(reasons) if reasons else "looks normal",
                "rule_hits": rule_hits,
            })

            continue  # 跳过后续检查

        webdriver = to_bool(getattr(row, "level1_webdriver", False))
        pluginsLength = to_int(getattr(row, "level1_pluginsLength", 0))
        languages = to_list(getattr(row, "level1_languages", []))
        mimeTypesLength = to_int(getattr(row, "level1_mimeTypesLength", 0))
        hardwareConcurrency = to_int(getattr(row, "level1_hardwareConcurrency", 0))
        outerVsScreenWidth = to_int(getattr(row, "level1_outerVsScreenWidth", 0))
        userAgent = str(getattr(row, "level1_userAgent", ""))

        #  No webdriver
        if webdriver:
            risk_score += WEIGHT_WEBDRIVER
            reason = "webdriver=true"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "webdriver_true", "webdriver=true", WEIGHT_WEBDRIVER, reason)

        if "headlesschrome" in userAgent.lower():
            risk_score += WEIGHT_HEADLESS_UA
            reason = "HeadlessChrome in userAgent"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "headless_user_agent", "HeadlessChrome in userAgent", WEIGHT_HEADLESS_UA, reason)

        # plugins number or mimeTypes number equals 0
        if pluginsLength == 0 or mimeTypesLength == 0:     
            risk_score += WEIGHT_PLUGIN_OR_MIME_MISSING
            reason = "no plugins or mimeTypes"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "plugin_or_mime_missing", "No plugins or mimeTypes", WEIGHT_PLUGIN_OR_MIME_MISSING, reason)
        
        # languages is empty 
        if not languages:
            risk_score += WEIGHT_LANGUAGES_MISSING
            reason = "no languages"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "languages_missing", "No languages", WEIGHT_LANGUAGES_MISSING, reason)

        # hardwareConcurrency is 0 or too large
        hc = hardwareConcurrency    
        if hc == 0 :
            risk_score += WEIGHT_HARDWARE_ZERO
            reason = "hardwareConcurrency=0"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "hardware_concurrency_zero", "hardwareConcurrency=0", WEIGHT_HARDWARE_ZERO, reason)
        elif hc > 64:
            risk_score += WEIGHT_HARDWARE_TOO_LARGE
            reason = f"abnormal hardwareConcurrency={hc}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "hardware_concurrency_too_large", "Abnormal hardwareConcurrency", WEIGHT_HARDWARE_TOO_LARGE, reason)

        # level1.outerVsScreenWidth is too large
        diff = outerVsScreenWidth
        if abs(diff) > 200:
            risk_score += WEIGHT_WINDOW_WIDTH_ABNORMAL
            reason = f"abnormal outerVsScreenWidth={diff}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "outer_screen_width_abnormal", "Abnormal outerVsScreenWidth", WEIGHT_WINDOW_WIDTH_ABNORMAL, reason)

        # userAgent is empty or too short
        if not userAgent or len(userAgent) < 20:
            risk_score += WEIGHT_UA_MISSING_OR_SHORT
            reason = "userAgent is empty or too short"
            reasons.append(reason)
            add_rule_hit(rule_hits, 1, "user_agent_missing_or_short", "UserAgent missing or too short", WEIGHT_UA_MISSING_OR_SHORT, reason)

        # 可以加入组合规则进一步判断

        normalized_score = score.normalize_score(risk_score, max_score)

        results.append({
            "event_id": getattr(row, "id", ""),
            "user_name": getattr(row, "username", ""),
            "timestamp": getattr(row, "timestamp", ""),
            "user_ip": getattr(row, "ip", ""),
            "user_agent": getattr(row, "user_agent", ""),
            "raw_score": risk_score,
            "normalized_score": normalized_score,
            "reasons": "; ".join(reasons) if reasons else "looks normal",
            "rule_hits": rule_hits,
        })

    return pd.DataFrame(results)

if __name__ == "__main__":
    df_tmp = data_read.read_data_from_mysql()
    df = data_read.parse_data(df_tmp)
    df_results = analyze_level1(df)
    # 用excel查看结果
    result_file = "level1_analysis.xlsx"
    df_results.to_excel(result_file, index=False)
