# Level 2: Cross-field consistency check
import pandas as pd

from pipeline import data_read, score
from pipeline.levels.utils import add_rule_hit, is_missing, to_bool, to_int

LEVEL2_REQUIRED_FIELDS = [
    "level2_userAgent",
    "level2_platform",
    "level2_gpuVendor",
    "level2_gpuRenderer",
    "level2_hasChromeApp",
    "level2_hasChromeRuntime",
    "level2_deviceMemory",
    "level2_screenVsWindowMismatch",
    "level2_uaPlatformMismatch",
    "level2_notificationPermission"
]

MAX_LEVEL2_SCORE = 100
WEIGHT_LEVEL2_MISSING = 35
WEIGHT_UA_PLATFORM_MISMATCH = 40
WEIGHT_GPU_MISSING = 10
WEIGHT_GPU_UA_MISMATCH = 25
WEIGHT_CHROME_APP_MISSING = 8
WEIGHT_CHROME_RUNTIME_MISSING = 5
WEIGHT_SCREEN_TOO_CONSISTENT = 5
WEIGHT_DEVICE_MEMORY_ABNORMAL = 12
WEIGHT_NOTIFICATION_UNEXPECTED = 3

GPU_ALLOWLIST = {
    "windows": ["intel", "nvidia", "amd", "radeon"],
    "mac": ["apple", "intel", "amd", "radeon"],
    "ios": ["apple"],
    "android": ["adreno", "mali", "powervr", "qualcomm"],
    "linux": ["intel", "nvidia", "amd", "radeon", "mesa"]
}

def infer_os_from_ua(ua):
    ua = ua.lower()
    if "iphone" in ua or "ipad" in ua or "ipod" in ua:
        return "ios"
    elif "android" in ua:
        return "android"
    elif "windows" in ua:
        return "windows"
    elif "mac os x" in ua or "macintosh" in ua:
        return "mac"
    elif "linux" in ua:
        return "linux"
    else:
        return "unknown"

def infer_os_from_platform(platform):
    platform = platform.lower()
    if "iphone" in platform or "ipad" in platform or "ipod" in platform:
        return "ios"
    elif "android" in platform:
        return "android"
    elif "windows" in platform or "win" in platform:
        return "windows"
    elif "mac" in platform:
        return "mac"
    elif "linux" in platform:
        return "linux"
    else:
        return "unknown"

def analyze_level2(df):
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        max_score = MAX_LEVEL2_SCORE
        risk_score = 0
        reasons = []
        rule_hits = []

        missing_fields = [
            field for field in LEVEL2_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL2_REQUIRED_FIELDS)
        
        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL2_MISSING
            reason = f"{len(missing_fields)} out of {len(LEVEL2_REQUIRED_FIELDS)} key fields are missing or unknown"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "level2_many_missing_fields", "Many missing Level 2 signals", WEIGHT_LEVEL2_MISSING, reason)
        
            results.append({
                "event_id": getattr(row, "id", ""),
                "user_name": getattr(row, "username", ""),
                "timestamp": getattr(row, "timestamp", ""),
                "user_ip": getattr(row, "ip", ""),
                "raw_score": risk_score,
                "normalized_score": score.normalize_score(risk_score, max_score),
                "reasons": "; ".join(reasons) if reasons else "looks normal",
                "rule_hits": rule_hits,
            })

            continue  # 跳过后续检查

        

        ua = str(getattr(row, "level2_userAgent", ""))
        platform = str(getattr(row, "level2_platform", "")).lower()
        gpu_vendor = str(getattr(row, "level2_gpuVendor", "")).lower()
        gpu_renderer = str(getattr(row, "level2_gpuRenderer", "")).lower()
        has_chrome_app = to_bool(getattr(row, "level2_hasChromeApp", False))
        device_memory = to_int(getattr(row, "level2_deviceMemory", 0))
        screen_mismatch = to_bool(getattr(row, "level2_screenVsWindowMismatch", False))
        ua_platform_mismatch = to_bool(getattr(row, "level2_uaPlatformMismatch", False))
        notification_permission = str(getattr(row, "level2_notificationPermission", ""))

        # UA inconsistent with platform
        os_from_ua = infer_os_from_ua(ua)
        os_from_platform = infer_os_from_platform(platform)
        if ua_platform_mismatch:
            risk_score += WEIGHT_UA_PLATFORM_MISMATCH
            reason = "UA-platform mismatch"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "ua_platform_mismatch", "UA-platform mismatch", WEIGHT_UA_PLATFORM_MISMATCH, reason)
        elif os_from_ua != "unknown" and os_from_platform != "unknown":
            if os_from_ua != os_from_platform:
                if (os_from_ua in ["linux", "android"] and os_from_platform in ["linux", "android"]) or \
                   (os_from_ua in ["mac", "ios"] and os_from_platform in ["mac", "ios"]):
                    pass  # 这两类系统之间的误判风险较大，暂不扣分
                else:
                    risk_score += WEIGHT_UA_PLATFORM_MISMATCH
                    reason = "UA-platform mismatch"
                    reasons.append(reason)
                    add_rule_hit(rule_hits, 2, "ua_platform_mismatch", "UA-platform mismatch", WEIGHT_UA_PLATFORM_MISMATCH, reason)

        # GPU vender or renderer is ""
        if gpu_vendor in ["", "unknown", "error", "null", "none"]:
            risk_score += WEIGHT_GPU_MISSING
            reason = "GPU vendor is empty"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "gpu_vendor_missing", "GPU vendor is empty", WEIGHT_GPU_MISSING, reason)
        elif gpu_renderer in ["", "unknown", "error", "null", "none"]:
            risk_score += WEIGHT_GPU_MISSING
            reason = "GPU renderer is empty"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "gpu_renderer_missing", "GPU renderer is empty", WEIGHT_GPU_MISSING, reason)
        
        # GPU inconsistent with UA
        os_from_ua = infer_os_from_ua(ua)
        allowed_gpus = GPU_ALLOWLIST.get(os_from_ua, [])
        if not allowed_gpus:
            pass  # 无法判断的 UA，跳过 GPU 检查
        elif not any(k in gpu_vendor for k in allowed_gpus) and not any(k in gpu_renderer for k in allowed_gpus):
            risk_score += WEIGHT_GPU_UA_MISMATCH
            reason = "GPU inconsistent with UA"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "gpu_ua_mismatch", "GPU inconsistent with UA", WEIGHT_GPU_UA_MISMATCH, reason)
        
        # Chrome app/runtime mismatch
        if "chrome" in ua.lower():
            if not has_chrome_app:
                risk_score += WEIGHT_CHROME_APP_MISSING
                reason = "Chrome UA but no Chrome app"
                reasons.append(reason)
                add_rule_hit(rule_hits, 2, "chrome_app_missing", "Chrome UA but no Chrome app", WEIGHT_CHROME_APP_MISSING, reason)
        
        # screen and window size mismatch
        if not screen_mismatch:
            risk_score += WEIGHT_SCREEN_TOO_CONSISTENT
            reason = "screen and window size are too consistent"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "screen_window_too_consistent", "Screen and window size are too consistent", WEIGHT_SCREEN_TOO_CONSISTENT, reason)

        # deviceMemory is 0 or too large
        if device_memory == 0 or device_memory > 128:
            risk_score += WEIGHT_DEVICE_MEMORY_ABNORMAL
            reason = f"abnormal deviceMemory={device_memory}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "device_memory_abnormal", "Abnormal deviceMemory", WEIGHT_DEVICE_MEMORY_ABNORMAL, reason)
        
        # notification permission consistency
        if notification_permission not in ["granted", "prompt"]:
            risk_score += WEIGHT_NOTIFICATION_UNEXPECTED
            reason = f"unexpected notification permission: {notification_permission}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 2, "notification_permission_unexpected", "Unexpected notification permission", WEIGHT_NOTIFICATION_UNEXPECTED, reason)

        normalized_score = score.normalize_score(risk_score, max_score)

        results.append({
            "event_id": getattr(row, "id", ""),
            "user_name": getattr(row, "username", ""),
            "timestamp": getattr(row, "timestamp", ""),
            "user_ip": getattr(row, "ip", ""),
            "raw_score": risk_score,
            "normalized_score": normalized_score,
            "reasons": "; ".join(reasons) if reasons else "looks normal",
            "rule_hits": rule_hits,
        })

    return pd.DataFrame(results)

if __name__ == "__main__":
    df_tmp = data_read.read_data_from_mysql()
    df = data_read.parse_data(df_tmp)
    df_results = analyze_level2(df)
    # 用excel查看结果
    result_file = "level2_analysis.xlsx"
    df_results.to_excel(result_file, index=False)
