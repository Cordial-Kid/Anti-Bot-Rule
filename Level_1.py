# Level 1: Basic Usability check
import pandas as pd
import os,sys
import score
os.chdir(sys.path[0])

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

def is_missing(value):
    if isinstance(value, str):
        return value == "" or value.lower() in ["unknown", "error", "null", "none"]
    return False

def analyze_level1(excel_file):
    df = pd.read_excel(excel_file)
    # 将列名中的点号替换成下划线，便于 itertuples/namedtuple 属性访问
    df.columns = [str(c).replace('.', '_') for c in df.columns]
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        reasons = []
        risk_score = 0
        max_score = MAX_LEVEL1_SCORE

        missing_fields = [
            field for field in LEVEL1_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL1_REQUIRED_FIELDS)

        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL1_MISSING
            reasons.append("many missing fields in level 1 signals")

            results.append({
                "user_name": getattr(row, "username", ""),
                "timestamp": getattr(row, "timestamp", ""),
                "user_ip": getattr(row, "ip", ""),
                "normalized_score": score.normalize_score(risk_score, max_score),
                "reasons": "; ".join(reasons) if reasons else "looks normal"
            })

            continue  # 跳过后续检查

        webdriver = bool(getattr(row, "level1_webdriver", True))
        pluginsLength = int (getattr(row, "level1_pluginsLength", 0) or 0)
        languages = str(getattr(row, "level1_languages", "[]"))
        mimeTypesLength = int(getattr(row, "level1_mimeTypesLength", 0) or 0)
        hardwareConcurrency = int(getattr(row, "level1_hardwareConcurrency", 0) or 0)
        outerVsScreenWidth = int(getattr(row, "level1_outerVsScreenWidth", 0) or 0)
        userAgent = str(getattr(row, "level1_userAgent", ""))

        #  No webdriver
        if webdriver:
            risk_score += WEIGHT_WEBDRIVER
            reasons.append("webdriver=true")

        if "headlesschrome" in userAgent.lower():
            risk_score += WEIGHT_HEADLESS_UA
            reasons.append("HeadlessChrome in userAgent")

        # plugins number or mimeTypes number equals 0
        if pluginsLength == 0 or mimeTypesLength == 0:     
            risk_score += WEIGHT_PLUGIN_OR_MIME_MISSING
            reasons.append("no plugins or mimeTypes")
        
        # languages is empty 
        Languages = eval(languages) if languages.startswith("[") else [languages]
        if not Languages:
            risk_score += WEIGHT_LANGUAGES_MISSING
            reasons.append("no languages")

        # hardwareConcurrency is 0 or too large
        hc = hardwareConcurrency    
        if hc == 0 :
            risk_score += WEIGHT_HARDWARE_ZERO
            reasons.append("hardwareConcurrency=0")
        elif hc > 64:
            risk_score += WEIGHT_HARDWARE_TOO_LARGE
            reasons.append(f"abnormal hardwareConcurrency={hc}")

        # level1.outerVsScreenWidth is too large
        diff = outerVsScreenWidth
        if abs(diff) > 200:
            risk_score += WEIGHT_WINDOW_WIDTH_ABNORMAL
            reasons.append(f"abnormal outerVsScreenWidth={diff}")

        # userAgent is empty or too short
        if not userAgent or len(userAgent) < 20:
            risk_score += WEIGHT_UA_MISSING_OR_SHORT
            reasons.append("userAgent is empty or too short")

        # 可以加入组合规则进一步判断

        normalized_score = score.normalize_score(risk_score, max_score)

        results.append({
            "user_name": getattr(row, "username", ""),
            "timestamp": getattr(row, "timestamp", ""),
            "user_ip": getattr(row, "ip", ""),
            "normalized_score": normalized_score,
            "reasons": "; ".join(reasons) if reasons else "looks normal"
        })

    return pd.DataFrame(results)

if __name__ == "__main__":
    excel_file ="output.xlsx"
    df_results = analyze_level1(excel_file)
    result_file = "level1_analysis.xlsx"
    df_results.to_excel(result_file, index=False)
