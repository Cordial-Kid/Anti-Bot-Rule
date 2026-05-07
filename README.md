# Anti Bot Rule

基于浏览器指纹的可解释反爬/反自动化规则评分项目。

本项目将浏览器侧采集到的指纹信号拆分为三个 Level，分别计算风险分，最后通过加权汇总得到最终 `risk_score`。项目当前采用规则评分方式，不依赖机器学习模型，适合用于规则验证、风险分析、样本回溯和后续模型特征工程。

## Features

- 三层浏览器指纹风险规则
- 可解释评分结果，每条命中规则会写入 `reasons`
- 支持从 JSON 展平为 Excel
- 输出每个 Level 的分析结果和最终汇总结果
- 权重集中配置，便于调参

## Project Structure

```text
anti-bot-rule/
├── main.py                         # 主入口，运行完整评分流程
├── score.py                        # 分数归一化与最终加权汇总
├── Level_1.py                      # Level 1：基础可用性与明显自动化信号
├── Level_2.py                      # Level 2：跨字段一致性检查
├── Level_3.py                      # Level 3：高级指纹与环境稳定性检查
├── json_to_excel.py                # JSON 数据展开为 output.xlsx
├── output_example.xlsx             # 输入数据文件样例
└── final_analysis.xlsx             # 最终评分输出
```

## Requirements

建议使用 Python 3.9+。

主要依赖：

```bash
pip install pandas openpyxl
```

## Quick Start

将`main.py`中的`output.xlsx`改为`output_example.xlsx`,直接运行：

```bash
python main.py
```

运行后会生成：

```text
final_analysis.xlsx
```

如果需要先从 JSON 数据生成 Excel：

```bash
python json_to_excel.py
python main.py
```

也可以单独运行某一层规则：

```bash
python Level_1.py
python Level_2.py
python Level_3.py
```

对应输出：

```text
level1_analysis.xlsx
level2_analysis.xlsx
level3_analysis.xlsx
```

## Input

主流程默认读取：

```text
output.xlsx
```

Excel 中应包含基础字段：

```text
username
timestamp
ip
```

以及三层指纹字段，例如：

```text
level1.webdriver
level1.userAgent
level2.platform
level2.gpuVendor
level2.gpuRenderer
level3.fontsCount
level3.audioSample
level3.requestIdleCallbackSupported
```

代码中会将字段名中的 `.` 转换为 `_` 后再访问，例如 `level1.webdriver` 会变为 `level1_webdriver`。

## Output

最终输出文件：

```text
final_analysis.xlsx
```

主要字段：

| 字段 | 说明 |
|---|---|
| `user_name` | 用户名 |
| `timestamp` | 请求时间 |
| `user_ip` | 用户 IP |
| `risk_score` | 最终风险分 |

单层分析输出会额外包含：

| 字段 | 说明 |
|---|---|
| `normalized_score` | 当前 Level 的归一化风险分 |
| `reasons` | 命中的规则原因 |

## Scoring Model

三个 Level 内部均采用 100 分封顶：

```python
MAX_LEVEL1_SCORE = 100
MAX_LEVEL2_SCORE = 100
MAX_LEVEL3_SCORE = 100
```

最终加权公式定义在 `score.py`：

```python
LEVEL_WEIGHTS = (0.35, 0.25, 0.40)
```

即：

```text
final_score = level1_score * 0.35
            + level2_score * 0.25
            + level3_score * 0.40
```

权重含义：

| Level | 权重 | 说明 |
|---|---:|---|
| Level 1 | 35% | 基础自动化信号，例如 webdriver、HeadlessChrome |
| Level 2 | 25% | 跨字段一致性信号，价值高但误伤可能较多 |
| Level 3 | 40% | 高级指纹和虚拟化环境信号，例如 SwiftShader、音频、字体 |

## Rule Levels

### Level 1: Basic Usability Check

关注基础浏览器环境和明显自动化特征。

典型规则：

- `webdriver=true`
- UA 中包含 `HeadlessChrome`
- 插件或 MIME 类型缺失
- 语言列表为空
- `hardwareConcurrency` 异常
- UA 为空或过短

强信号示例：

```text
webdriver=true: +50
HeadlessChrome in userAgent: +50
```

### Level 2: Cross-field Consistency Check

关注不同字段之间是否互相矛盾。

典型规则：

- UA 与 platform 不一致
- GPU 与 UA 操作系统不一致
- Chrome UA 但 Chrome API 结构异常
- screen/window 过于一致
- deviceMemory 异常

强信号示例：

```text
UA-platform mismatch: +40
GPU inconsistent with UA: +25
```

### Level 3: Advanced Fingerprinting

关注高级浏览器指纹和运行环境稳定性。

典型规则：

- 字体数量异常
- audio sample 缺失或全平
- SwiftShader 虚拟 GPU
- MediaDevices / SpeechSynthesis / queueMicrotask 等 API 缺失
- DevTools 痕迹

强信号示例：

```text
SwiftShader virtual GPU: +60
flat audio sample: +20
```

## Risk Levels

建议按最终 `risk_score` 分层：

| 分数 | 风险等级 | 建议动作 |
|---:|---|---|
| 0-25 | Low | 正常放行，仅记录 |
| 25-45 | Suspicious | 观察、限频、增加日志 |
| 45-65 | Medium High | 触发轻量挑战或二次验证 |
| 65+ | High | 强验证、限流或拦截 |

阈值应结合真实业务数据和人工标注样本继续校准。

## Design Principles

- 强自动化信号高权重，例如 `webdriver=true`、`HeadlessChrome`、`SwiftShader`
- 弱信号低权重，例如 notification 状态、screen/window 过于一致
- 缺失数据单独处理，避免同一采集失败原因被重复扣分
- 字段互相矛盾比字段缺失更重要
- 三个 Level 使用统一 100 分尺度，便于调参

## Notes

- 当前项目偏规则验证和风险分析，生产环境中建议结合业务行为特征、访问频率、账号画像等信息使用。
- 当前部分字段解析仍使用 `eval()`，后续建议替换为 `ast.literal_eval()` 以提升稳定性和安全性。
- 权重不是固定答案，应结合真实样本的误伤率和漏判率持续调整。

## License

未指定许可证。
