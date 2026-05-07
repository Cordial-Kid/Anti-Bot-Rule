# Level 3: Advanced Fingerprinting And Stability Analysis
import pandas as pd
import os,sys
import score
os.chdir(sys.path[0])

LEVEL3_REQUIRED_FIELDS = [
    "level3_fontsCount",
    "level3_audioSample",
    "level3_gpuVendor",
    "level3_gpuRenderer",
    "level3_hasMediaDevices",
    "level3_hasSpeechSynthesis",
    "level3_intlTimeZone",
    "level3_dateTimeZoneOffset",
    "level3_requestIdleCallbackSupported",
    "level3_idleCallbackExecuted",
    "level3_queueMicrotaskSupported",
    "level3_touchEventSupported",
    "level3_pointerEventSupported",
    "level3_hasReactDevTools",
    "level3_hasDevtools"
]

MAX_LEVEL3_SCORE = 100
WEIGHT_LEVEL3_MISSING = 35
WEIGHT_NO_FONTS = 15
WEIGHT_FEW_FONTS = 8
WEIGHT_NO_AUDIO_SAMPLE = 12
WEIGHT_FLAT_AUDIO_SAMPLE = 20
WEIGHT_SWIFTSHADER_GPU = 60
WEIGHT_MEDIA_DEVICES_MISSING = 10
WEIGHT_SPEECH_SYNTHESIS_MISSING = 5
WEIGHT_TIMEZONE_UNKNOWN = 10
WEIGHT_TIMEZONE_OFFSET_ZERO = 3
WEIGHT_REQUEST_IDLE_UNSUPPORTED = 5
WEIGHT_IDLE_CALLBACK_NOT_EXECUTED = 5
WEIGHT_QUEUE_MICROTASK_UNSUPPORTED = 8
WEIGHT_POINTER_EVENT_UNSUPPORTED = 3
WEIGHT_DEVTOOLS_ARTIFACTS = 5

def is_missing(value):
    if isinstance(value, str):
        return value == "" or value.lower() in ["unknown", "error", "null", "none"]
    return False

def analyze_level3(excel_file):
    df = pd.read_excel(excel_file)
    # 将列名中的点号替换成下划线，便于 itertuples/namedtuple 属性访问
    df.columns = [str(c).replace('.', '_') for c in df.columns]
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        risk_score = 0
        max_score = MAX_LEVEL3_SCORE
        reasons = []

        missing_fields = [
            field for field in LEVEL3_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL3_REQUIRED_FIELDS)

        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL3_MISSING
            reasons.append("many missing fields in level 3 signals")

            results.append({
                "user_name": getattr(row, "username", ""),
                "timestamp": getattr(row, "timestamp", ""),
                "user_ip": getattr(row, "ip", ""),
                "normalized_score": score.normalize_score(risk_score, max_score),
                "reasons": "; ".join(reasons) if reasons else "looks normal"
            })

            continue  # 跳过后续检查

        fonsCount = int (getattr(row, "level3_fontsCount", 0) or 0)
        audioSample_tmp = str(getattr(row, "level3_audioSample", "[]"))
        audioSample = eval(audioSample_tmp) if audioSample_tmp.startswith("[") else []
        gpu_vender = str(getattr(row, "level3_gpuVendor", "unknown")).lower()
        gpu_renderer = str(getattr(row, "level3_gpuRenderer", "unknown")).lower()
        hasMediaDevices = getattr(row, "level3_hasMediaDevices", False)
        hasSpeechSynthesis = getattr(row, "level3_hasSpeechSynthesis", False)
        tz = str(getattr(row, "level3_intlTimeZone", "unknown"))
        tz_offset = int(getattr(row, "level3_dateTimeZoneOffset", 0)or 0)
        requestIdleCallback = getattr(row, "level3_requestIdleCallbackSupported", False)
        idleCallbackExecuted = getattr(row, "level3_idleCallbackExecuted", False)
        queueMicrotaskSupported = getattr(row, "level3_queueMicrotaskSupported", False)
        touchEventSupported = getattr(row, "level3_touchEventSupported", False)
        pointerEventSupported = getattr(row, "level3_pointerEventSupported", False)
        hasReactDevTools = getattr(row, "level3_hasReactDevTools", True)
        hasDevtools = getattr(row, "level3_hasDevtools", True)

        # fonts is zero or very low
        if fonsCount == 0:
            risk_score += WEIGHT_NO_FONTS
            reasons.append("no fonts detected")
        elif fonsCount < 5:
            risk_score += WEIGHT_FEW_FONTS
            reasons.append(f"very few fonts detected: {fonsCount}")

        # audio sample is empty or flat
        if not audioSample:
            risk_score += WEIGHT_NO_AUDIO_SAMPLE
            reasons.append("no audio sample")
        elif all(abs(v) < 1e-6 for v in audioSample):
            risk_score += WEIGHT_FLAT_AUDIO_SAMPLE
            reasons.append("flat audio sample")
        
        # webgl virtual GPU
        if "swiftshader" in gpu_renderer and "google inc" in gpu_vender:
            risk_score += WEIGHT_SWIFTSHADER_GPU
            reasons.append("virtual GPU detected (SwiftShader/Google Inc.)")

        # MediaDevices is missing
        if not hasMediaDevices:
            risk_score += WEIGHT_MEDIA_DEVICES_MISSING
            reasons.append("MediaDevices API missing")
        
        # SpeechSynthesis is missing
        if not hasSpeechSynthesis:
            risk_score += WEIGHT_SPEECH_SYNTHESIS_MISSING
            reasons.append("SpeechSynthesis API missing")

        # Timezone info is missing or abnormal
        if tz == "unknown":
            risk_score += WEIGHT_TIMEZONE_UNKNOWN
            reasons.append("timezone is unknown")
        elif tz_offset == 0:
            risk_score += WEIGHT_TIMEZONE_OFFSET_ZERO
            reasons.append("timezone offset is zero")

        # requestIdleCallback is not supported
        if not requestIdleCallback:
            risk_score += WEIGHT_REQUEST_IDLE_UNSUPPORTED
            reasons.append("requestIdleCallback not supported")
        
        # idle callback is not executed
        if not idleCallbackExecuted:
            risk_score += WEIGHT_IDLE_CALLBACK_NOT_EXECUTED
            reasons.append("idle callback did not execute")

        # queueMicrotask is not supported
        if not queueMicrotaskSupported:
            risk_score += WEIGHT_QUEUE_MICROTASK_UNSUPPORTED
            reasons.append("queueMicrotask not supported")
        
        # pointer is not supported
        if not pointerEventSupported:
            risk_score += WEIGHT_POINTER_EVENT_UNSUPPORTED
            reasons.append("PointerEvent not supported")
        
        # dev tools artifacts
        if hasReactDevTools or hasDevtools:
            risk_score += WEIGHT_DEVTOOLS_ARTIFACTS
            reasons.append("DevTools artifacts detected")
        
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
    df_results = analyze_level3(excel_file)
    result_file = "level3_analysis.xlsx"
    df_results.to_excel(result_file, index=False)    
