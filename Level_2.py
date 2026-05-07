# Level 2: Cross-field consistency check
import pandas as pd
import os,sys
import score
os.chdir(sys.path[0])

LEVEL2_REQUIRED_FIELDS = [
    "level2_userAgent",
    "level2_platform",
    "level2_gpuVendor",
    "level2_gpuRenderer",
    "level2_hasChromeApp",
    "level2_hasChromeRuntime",
    "level2_deviceMemory",
    "level2_screenVsWindowMismatch",
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

def is_missing(value):
    if isinstance(value, str):
        return value == "" or value.lower() in ["unknown", "error", "null", "none"]
    return False
    

def analyze_level2(excel_file):
    df = pd.read_excel(excel_file)
    # 将列名中的点号替换成下划线，便于 itertuples/namedtuple 属性访问
    df.columns = [str(c).replace('.', '_') for c in df.columns]
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        max_score = MAX_LEVEL2_SCORE
        risk_score = 0
        reasons = []

        missing_fields = [
            field for field in LEVEL2_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL2_REQUIRED_FIELDS)
        
        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL2_MISSING
            reasons.append(f"{len(missing_fields)} out of {len(LEVEL2_REQUIRED_FIELDS)} key fields are missing or unknown")
        
            results.append({
                "user_name": getattr(row, "username", ""),
                "timestamp": getattr(row, "timestamp", ""),
                "user_ip": getattr(row, "ip", ""),
                "normalized_score": score.normalize_score(risk_score, max_score),
                "reasons": "; ".join(reasons) if reasons else "looks normal"
            })

            continue  # 跳过后续检查

        

        ua = str(getattr(row, "level2_userAgent", ""))
        platform = str(getattr(row, "level2_platform", "")).lower()
        gpu_vendor = str(getattr(row, "level2_gpuVendor", "")).lower()
        gpu_renderer = str(getattr(row, "level2_gpuRenderer", "")).lower()
        has_chrome_app = bool(getattr(row, "level2_hasChromeApp", False))
        has_chrome_runtime = bool(getattr(row, "level2_hasChromeRuntime", False))
        device_memory = int(getattr(row, "level2_deviceMemory", 0) or 0)
        screen_mismatch = bool(getattr(row, "level2_screenVsWindowMismatch", False))
        notification_permission = str(getattr(row, "level2_notificationPermission", ""))

        # UA inconsistent with platform
        os_from_ua = infer_os_from_ua(ua)
        os_from_platform = infer_os_from_platform(platform)
        if os_from_ua != "unknown" and os_from_platform != "unknown":
            if os_from_ua != os_from_platform:
                if (os_from_ua in ["linux", "android"] and os_from_platform in ["linux", "android"]) or \
                   (os_from_ua in ["mac", "ios"] and os_from_platform in ["mac", "ios"]):
                    pass  # 这两类系统之间的误判风险较大，暂不扣分
                else:
                    risk_score += WEIGHT_UA_PLATFORM_MISMATCH
                    reasons.append("UA-platform mismatch")

        # GPU vender or renderer is ""
        if gpu_vendor in ["", "unknown", "error", "null", "none"]:
            risk_score += WEIGHT_GPU_MISSING
            reasons.append("GPU vendor is empty")
        elif gpu_renderer in ["", "unknown", "error", "null", "none"]:
            risk_score += WEIGHT_GPU_MISSING
            reasons.append("GPU renderer is empty")
        
        # GPU inconsistent with UA
        os_from_ua = infer_os_from_ua(ua)
        allowed_gpus = GPU_ALLOWLIST.get(os_from_ua, [])
        if not allowed_gpus:
            pass  # 无法判断的 UA，跳过 GPU 检查
        elif not any(k in gpu_vendor for k in allowed_gpus) and not any(k in gpu_renderer for k in allowed_gpus):
            risk_score += WEIGHT_GPU_UA_MISMATCH
            reasons.append("GPU inconsistent with UA")
        
        # Chrome app/runtime mismatch
        if "chrome" in ua.lower():
            if not has_chrome_app:
                risk_score += WEIGHT_CHROME_APP_MISSING
                reasons.append("Chrome UA but no Chrome app")
            elif not has_chrome_runtime:
                risk_score += WEIGHT_CHROME_RUNTIME_MISSING
                reasons.append("Chrome UA but no Chrome runtime")
        
        # screen and window size mismatch
        if not screen_mismatch:
            risk_score += WEIGHT_SCREEN_TOO_CONSISTENT
            reasons.append("screen and window size are too consistent")

        # deviceMemory is 0 or too large
        if device_memory == 0 or device_memory > 128:
            risk_score += WEIGHT_DEVICE_MEMORY_ABNORMAL
            reasons.append(f"abnormal deviceMemory={device_memory}")
        
        # notification permission consistency
        if notification_permission not in ["granted", "prompt"]:
            risk_score += WEIGHT_NOTIFICATION_UNEXPECTED
            reasons.append(f"unexpected notification permission: {notification_permission}")

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
    excel_file = "output.xlsx" 
    df_results = analyze_level2(excel_file)
    result_file = "level2_analysis.xlsx"
    df_results.to_excel(result_file, index=False)
