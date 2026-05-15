# Level 3: Advanced Fingerprinting And Stability Analysis
import pandas as pd

from pipeline import data_read, score
from pipeline.levels.utils import add_rule_hit, is_missing, to_bool, to_float_list, to_int

LEVEL3_REQUIRED_FIELDS = [
    "level3_fontsCount",
    "level3_audioSample",
    "level3_audioJitterVar",
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
    "level3_hasDevtools",
    "llmNature_honeypot_triggered",
    "llmNature_honeypot_triggerCount",
    "llmNature_domAnomaly_burstCount",
    "llmNature_domAnomaly_layoutReads",
    "llmNature_mutation_totalMutations",
    "llmNature_mutation_uniqueNodes",
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
WEIGHT_HONEYPOT_TRIGGERED = 45
WEIGHT_DOM_AUTOMATION_BURST = 15
WEIGHT_MUTATION_BURST = 8

def analyze_level3(df):
    df = df.fillna("")  # 所有 NaN 替换为空字符串

    results = []

    for row in df.itertuples():
        risk_score = 0
        max_score = MAX_LEVEL3_SCORE
        reasons = []
        rule_hits = []

        missing_fields = [
            field for field in LEVEL3_REQUIRED_FIELDS
            if is_missing(getattr(row, field, ""))
        ]

        missing_ratio = len(missing_fields) / len(LEVEL3_REQUIRED_FIELDS)

        if missing_ratio > 0.5:
            risk_score += WEIGHT_LEVEL3_MISSING
            reason = "many missing fields in level 3 signals"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "level3_many_missing_fields", "Many missing Level 3 signals", WEIGHT_LEVEL3_MISSING, reason)

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

        fonsCount = to_int(getattr(row, "level3_fontsCount", 0))
        audioSample = to_float_list(getattr(row, "level3_audioSample", []))
        gpu_vender = str(getattr(row, "level3_gpuVendor", "unknown")).lower()
        gpu_renderer = str(getattr(row, "level3_gpuRenderer", "unknown")).lower()
        hasMediaDevices = to_bool(getattr(row, "level3_hasMediaDevices", False))
        hasSpeechSynthesis = to_bool(getattr(row, "level3_hasSpeechSynthesis", False))
        tz = str(getattr(row, "level3_intlTimeZone", "unknown"))
        tz_offset = to_int(getattr(row, "level3_dateTimeZoneOffset", 0))
        requestIdleCallback = to_bool(getattr(row, "level3_requestIdleCallbackSupported", False))
        idleCallbackExecuted = to_bool(getattr(row, "level3_idleCallbackExecuted", False))
        queueMicrotaskSupported = to_bool(getattr(row, "level3_queueMicrotaskSupported", False))
        touchEventSupported = to_bool(getattr(row, "level3_touchEventSupported", False))
        pointerEventSupported = to_bool(getattr(row, "level3_pointerEventSupported", False))
        hasReactDevTools = to_bool(getattr(row, "level3_hasReactDevTools", False))
        hasDevtools = to_bool(getattr(row, "level3_hasDevtools", False))
        honeypotTriggered = to_bool(getattr(row, "llmNature_honeypot_triggered", False))
        honeypotTriggerCount = to_int(getattr(row, "llmNature_honeypot_triggerCount", 0))
        domBurstCount = to_int(getattr(row, "llmNature_domAnomaly_burstCount", 0))
        domLayoutReads = to_int(getattr(row, "llmNature_domAnomaly_layoutReads", 0))
        domQueryCount = (
            to_int(getattr(row, "llmNature_domAnomaly_qsCount", 0))
            + to_int(getattr(row, "llmNature_domAnomaly_qsAllCount", 0))
        )
        mutationTotal = to_int(getattr(row, "llmNature_mutation_totalMutations", 0))
        mutationUniqueNodes = to_int(getattr(row, "llmNature_mutation_uniqueNodes", 0))

        # fonts is zero or very low
        if fonsCount == 0:
            risk_score += WEIGHT_NO_FONTS
            reason = "no fonts detected"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "fonts_missing", "No fonts detected", WEIGHT_NO_FONTS, reason)
        elif fonsCount < 5:
            risk_score += WEIGHT_FEW_FONTS
            reason = f"very few fonts detected: {fonsCount}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "fonts_too_few", "Very few fonts detected", WEIGHT_FEW_FONTS, reason)

        # audio sample is empty or flat
        if not audioSample:
            risk_score += WEIGHT_NO_AUDIO_SAMPLE
            reason = "no audio sample"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "audio_sample_missing", "No audio sample", WEIGHT_NO_AUDIO_SAMPLE, reason)
        elif all(abs(v) < 1e-6 for v in audioSample):
            risk_score += WEIGHT_FLAT_AUDIO_SAMPLE
            reason = "flat audio sample"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "audio_sample_flat", "Flat audio sample", WEIGHT_FLAT_AUDIO_SAMPLE, reason)
        
        # webgl virtual GPU
        if "swiftshader" in gpu_renderer and "google inc" in gpu_vender:
            risk_score += WEIGHT_SWIFTSHADER_GPU
            reason = "virtual GPU detected (SwiftShader/Google Inc.)"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "swiftshader_gpu", "Virtual GPU detected", WEIGHT_SWIFTSHADER_GPU, reason)

        # MediaDevices is missing
        if not hasMediaDevices:
            risk_score += WEIGHT_MEDIA_DEVICES_MISSING
            reason = "MediaDevices API missing"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "media_devices_missing", "MediaDevices API missing", WEIGHT_MEDIA_DEVICES_MISSING, reason)
        
        # SpeechSynthesis is missing
        if not hasSpeechSynthesis:
            risk_score += WEIGHT_SPEECH_SYNTHESIS_MISSING
            reason = "SpeechSynthesis API missing"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "speech_synthesis_missing", "SpeechSynthesis API missing", WEIGHT_SPEECH_SYNTHESIS_MISSING, reason)

        # Timezone info is missing or abnormal
        if tz == "unknown":
            risk_score += WEIGHT_TIMEZONE_UNKNOWN
            reason = "timezone is unknown"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "timezone_unknown", "Timezone is unknown", WEIGHT_TIMEZONE_UNKNOWN, reason)
        elif tz_offset == 0:
            risk_score += WEIGHT_TIMEZONE_OFFSET_ZERO
            reason = "timezone offset is zero"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "timezone_offset_zero", "Timezone offset is zero", WEIGHT_TIMEZONE_OFFSET_ZERO, reason)

        # requestIdleCallback is not supported
        if not requestIdleCallback:
            risk_score += WEIGHT_REQUEST_IDLE_UNSUPPORTED
            reason = "requestIdleCallback not supported"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "request_idle_callback_unsupported", "requestIdleCallback not supported", WEIGHT_REQUEST_IDLE_UNSUPPORTED, reason)
        
        # idle callback is not executed
        if not idleCallbackExecuted:
            risk_score += WEIGHT_IDLE_CALLBACK_NOT_EXECUTED
            reason = "idle callback did not execute"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "idle_callback_not_executed", "Idle callback did not execute", WEIGHT_IDLE_CALLBACK_NOT_EXECUTED, reason)

        # queueMicrotask is not supported
        if not queueMicrotaskSupported:
            risk_score += WEIGHT_QUEUE_MICROTASK_UNSUPPORTED
            reason = "queueMicrotask not supported"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "queue_microtask_unsupported", "queueMicrotask not supported", WEIGHT_QUEUE_MICROTASK_UNSUPPORTED, reason)
        
        # pointer is not supported
        if not pointerEventSupported:
            risk_score += WEIGHT_POINTER_EVENT_UNSUPPORTED
            reason = "PointerEvent not supported"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "pointer_event_unsupported", "PointerEvent not supported", WEIGHT_POINTER_EVENT_UNSUPPORTED, reason)
        
        # dev tools artifacts
        if hasReactDevTools or hasDevtools:
            risk_score += WEIGHT_DEVTOOLS_ARTIFACTS
            reason = "DevTools artifacts detected"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "devtools_artifacts", "DevTools artifacts detected", WEIGHT_DEVTOOLS_ARTIFACTS, reason)

        if honeypotTriggered or honeypotTriggerCount > 0:
            risk_score += WEIGHT_HONEYPOT_TRIGGERED
            reason = f"honeypot triggered {honeypotTriggerCount} times"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "honeypot_triggered", "Honeypot triggered", WEIGHT_HONEYPOT_TRIGGERED, reason)

        if domQueryCount > 100 or domBurstCount > 50 or domLayoutReads > 200:
            risk_score += WEIGHT_DOM_AUTOMATION_BURST
            reason = (
                "abnormal DOM probing pattern: "
                f"queries={domQueryCount}, bursts={domBurstCount}, layoutReads={domLayoutReads}"
            )
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "dom_automation_burst", "Abnormal DOM probing pattern", WEIGHT_DOM_AUTOMATION_BURST, reason)

        if mutationTotal > 300 or mutationUniqueNodes > 120:
            risk_score += WEIGHT_MUTATION_BURST
            reason = f"abnormal DOM mutation volume: total={mutationTotal}, uniqueNodes={mutationUniqueNodes}"
            reasons.append(reason)
            add_rule_hit(rule_hits, 3, "mutation_burst", "Abnormal DOM mutation volume", WEIGHT_MUTATION_BURST, reason)
        
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
    df_results = analyze_level3(df)
    # 用excel查看结果
    result_file = "level3_analysis.xlsx"
    df_results.to_excel(result_file, index=False)    
