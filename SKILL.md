---
name: dumpling-site-eval
description: 纯零基础个体老板的饺子馆选址评估。收集必填 5 项（地址、月租金、面积、四时段蹲点客流、动线可达性），按需从高德/百度拉 POI，按 scoring-model.md 计算四维得分与总分，输出单文件 HTML 报告（可分享链接）+ 终端结论卡。无 API key 时自动用 mock 数据离线跑通。
---

# 饺子馆选址评估 Skill

## 触发条件

当用户说"帮我评估这个饺子铺位置 / 饺子选址 / 这个地址能不能开饺子馆 / 帮我算一下这个点位"时触发。识别关键词：饺子、选址、点位评估、开店、铺位。

若用户未提供足够输入，按下方「输入收集流程」逐项补齐。

## 输入收集流程

### 必填 5 项（缺任何一项仍可评，但置信度降档）

| # | 字段 | 说明 | 无填则置信度 |
|---|---|---|---|
| 1 | 地址 | 完整街道+门牌号，或经纬度 | — |
| 2 | 月租金 | 单位：元/月 | C 缺租金 |
| 3 | 面积 | 单位：㎡ | 不影响置信度 |
| 4 | 四时段蹲点客流 | 工作日午市 / 工作日晚市 / 周末午市 / 周末晚市，每时段「高峰 30 分钟的每分钟过店人数」 | B 缺客流 |
| 5 | 动线可达性 | 枚举：地铁直连无绕行 / 需绕行 ≤100m / 需绕行 >100m / 无地铁 | 位置侧此维度 0 分 |

### 选填 6 项

- 目标人群（白领 / 家庭 / 学生 / 混合）
- 客单价（默认 30 元，来自 dumpling.json）
- 堂食外卖比（默认 60:40）
- 转让费 + 总预算
- 自营 / 加盟
- 餐饮经验 + 计划开业时限

### 蹲点客流口径说明（必须明确告诉用户）

> 蹲点 = "每分钟经过店铺门口 1 米范围内的人数"，**不论进店与否**。
> 时段：工作日 12:00-12:30（午）、18:00-18:30（晚）；周末同时段。取高峰 30 分钟均值。
> 单位：人/分钟。

## 执行步骤

### Step 1：确认品类

默认为饺子（category_id=dumpling）。用户若说要评火锅/面馆，检查 references/categories/ 是否已有对应 JSON 参数卡；没有则提示"当前仅支持饺子品类，新增品类需在 categories/ 目录下放一张 JSON 参数卡"。

### Step 2：运行评估入口

本 skill 引擎（engine.js）是纯函数 IIFE，**file:// 和 HTTP 两种方式都能跑**。

#### 方式 A：HttpListener（推荐，零配置）

```powershell
# 在 skill 目录下启动 HTTP 服务（当前机器已配置好 port 8765）
powershell -NoProfile -Command "
  $root = 'C:\Users\ZhuanZ\.trae-cn\skills\dumpling-site-eval\scripts'
  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Add('http://localhost:8765/')
  $listener.Start()
  Write-Host 'Serving on http://localhost:8765/scripts/'
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath -replace '^/',''
    $file = Join-Path $root $path
    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentType = switch ([IO.Path]::GetExtension($file)) {
        '.html' { 'text/html;charset=utf-8' }
        '.js'   { 'application/javascript;charset=utf-8' }
        '.json' { 'application/json;charset=utf-8' }
        '.csv'  { 'text/csv;charset=utf-8' }
        default { 'application/octet-stream' }
      }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  }
"
```

| 页面 | 用途 |
|---|---|
| `http://localhost:8765/scripts/index.html` | 主评估页（表单 + 报告渲染） |
| `http://localhost:8765/scripts/index.html?selftest=1` | **自检入口**：页面加载自动跑 27 条 fixture 断言 |
| `http://localhost:8765/scripts/backtest.html` | 回测页（导入 CSV 批量跑，纯函数） |

#### 方式 B：file:// 直接双击

双击 `scripts/index.html` 也能打开（引擎内嵌在 `<script src="engine.js">` 里，不依赖 fetch）。**但注意**：file:// 下浏览器会拦截高德/百度 API 的 CORS 请求，自动回落到 MockProvider。

#### 自检

`?selftest=1` 入口每次跑 27 条断言 + 幂等性 3 次 + 缺字段稳定性。任何改动破坏断言都会在页面顶部显示红色横幅列出失败项。

### Step 2.5：参数卡改动流程

改 `references/categories/dumpling.json` 或内嵌默认值时，按以下顺序：

1. **改参数卡**：`dumpling.json` 和 `engine.js` 内嵌 defaults（两处同步）
2. **版本号 +0.1**：`category.version` 字段
3. **CHANGELOG.md 加条目**：版本号 + 改了什么 + 影响哪些子指标 + 是否影响结论档位
4. **硬刷新 + 跑自检**：`location.reload(true);` → 打开 `?selftest=1` 看全绿
5. **若新增/删除断言**：同步更新 `regression-fixture.js` 和 `engine.js` 里 `runSelftest()` 两处（保持一致）

### Step 3：缓存复用

评估同一商圈/坐标 500m 网格内的多个点位时，mock 和真实 API 结果会自动缓存 24 小时（localStorage），不会重复扣配额。

### Step 4：终端输出

在对话里输出一页「结论卡」文本，格式：

```
╔══════════════════════════════════╗
║  饺子馆选址评估 · 结论卡          ║
╠══════════════════════════════════╣
║  点位：{地址}                     ║
║  总分：{xx}/100  {结论 emoji}      ║
║  置信度：{A/B/C/D} {说明}         ║
╠══════════════════════════════════╣
║  需求侧 {xx}/40                   ║
║  位置侧 {xx}/25                   ║
║  竞争侧 {xx}/20                   ║
║  财务侧 {xx}/15                   ║
╠══════════════════════════════════╣
║  优势：...                        ║
║  短板：...                        ║
║  建议：...                        ║
╚══════════════════════════════════╝
```

同时把完整 HTML 报告的 file:// 链接发给用户。

## 置信度判断

| 档 | 条件 | 影响 |
|---|---|---|
| A 完整 | 蹲点客流 + 月租金 + 动线 三项全有 | 所有维度正常计分 |
| B 缺客流 | 未填四时段客流 | 需求侧 30 分按商圈类型经验区间估算，报告标注"客流为估算值" |
| C 缺租金 | 未填月租金 | 财务侧 15 分按参数卡中位数估算，报告标注"租金为估算值" |
| D 双缺 | 客流 + 租金都未填 | 仅用 POI + 竞品数据评估，报告标注"仅作参考" |

置信度不影响维度权重，只影响报告里的醒目提示和终端结论卡的备注。

## 评分模型概览

| 维度 | 权重 | 分项 |
|---|---|---|
| 需求侧 | 40 | 午高峰预期日单量 15 + 晚高峰预期日单量 15 + 500m 家庭户数 10 |
| 位置侧 | 25 | 最近地铁距离 10 + 动线可达性 10 + 主干道可见性 5 |
| 竞争侧 | 20 | 同品类门店密度 10 + 竞品强度 10 |
| 财务侧 | 15 | 租金占营收比 10 + 盈亏单量达成率 5 |

总分 ≥80 ✅ 建议开 / 60–79 ⚠️ 谨慎 / <60 ❌ 不建议。

所有阈值和常量存放在 `references/categories/{category_id}.json`，新增品类 = 新增一张 JSON，主逻辑零修改。

## 输出要求

### HTML 报告（必须包含）

1. 结论卡（总分 + 结论 + 置信度 + 四维雷达图）
2. 第一章：需求侧详解（日单量估算、家庭户数、商圈类型）
3. 第二章：位置侧详解（地铁距离、动线、主干道）
4. 第三章：竞争侧详解（密度、强度、是否蓝海）
5. 第四章：财务侧详解（租金比、盈亏单量、达成率）
6. 第五章：综合建议（优先级排序的 3–5 条可执行建议）
7. 第六章：模型说明（指标口径、参数来源、经验区间标注）
8. 第七章：免责声明（不是经营承诺、数据估算、需实地确认）
9. 页脚：数据来源 / 评估日期 / 模型版本 / 当前品类

### 终端结论卡（必须包含）

- 总分、结论 emoji、置信度档位
- 四维权重分解
- 2–3 条优势和 2–3 条短板
- 一句话行动建议

## 数据获取约束

| 数据源 | 当前状态 | 回落行为 |
|---|---|---|
| 高德 Web API | 无 key | 自动回落 mock，报告标注"模拟数据" |
| 百度 Place API | 无 key | 自动回落 mock，报告标注"模拟数据" |
| 用户手填 | — | 按 metrics.md 规则处理缺失值 |

**严禁编写任何针对大众点评/美团的爬虫**。竞品评分/人均只能通过官方 API 或用户手填。

## 坐标系约定

- 内部统一使用 **WGS-84**（GPS 原始经纬度）
- 高德 GCJ-02 / 百度 BD-09 在 provider 内部转换后返回 WGS-84
- 百度经纬度顺序是 lat,lng，高德是 lng,lat——providers 内部处理，上层无感知

## 配额与缓存

- 单点位 ≈ 18 次高德调用；个人账号一天 ≈ 5 个点
- assess.html 自动做缓存（localStorage，TTL 24h），同一坐标 500m 网格 + 同一 POI 类型复用结果
- 若评估 3 个同商圈点位，实际只打 1 次真实 API

## 新增品类

1. 在 `references/categories/` 下新建 `{new_category}.json`，结构参考 dumpling.json
2. 顶层 key 必须包含：category_id, category_name, metrics_conversion_rate, financial_constants, competitor_keywords, size_range, scoring_thresholds, weights, verdict_thresholds
3. 打开 `scripts/assess.html`，找到顶部的 `CATEGORY_DATA` JS 对象，复制粘贴新 JSON
4. 或者在 assess.html 的表单里增加品类选择下拉框，动态切换 CATEGORY_DATA
5. 主逻辑零修改

## 文件结构

```
dumpling-site-eval/
├── SKILL.md                    ← 本文件
├── references/
│   ├── metrics.md              ← 指标口径手册（16 个指标）
│   ├── scoring-model.md        ← 评分模型 + 参数卡 + 置信度
│   ├── CHANGELOG.md            ← 参数卡变更日志（v1.0 作废 / v1.1 / v1.2 / v1.3 / v1.4）
│   ├── error-log-template.csv  ← 错误记录模板（含 v1.0 望京 SOHO 作废案例）
│   ├── case-library-template.csv ← 案例库模板
│   └── categories/
│       └── dumpling.json       ← 饺子品类参数卡（v1.4 · 新增品类放这里）
├── scripts/
│   ├── engine.js               ← 核心引擎（纯函数 IIFE · 内嵌 runSelftest）
│   ├── index.html              ← 主评估页（表单 + 报告渲染 · 支持 ?selftest=1）
│   ├── backtest.html           ← 回测页（导入 CSV 批量跑）
│   ├── assess.html             ← 旧版备份（v1.0）
│   └── regression-fixture.js   ← 独立 fixture（可在 console 手动 eval）
└── examples/
    └── README.txt              ← 三个合成示例的运行说明
```

## 无 Node.js / 无 Python 环境说明

本 skill 采用 **纯 HTML+JS 方案**（无外部依赖），不依赖 npm/pip。engine.js 是纯函数 IIFE，file:// 直接双击能跑（MockProvider），HTTP 服务启动后能接高德/百度真实 API。

**自检不依赖 fetch**：engine.js 内嵌 fixture 数据，`?selftest=1` 在 file:// 和 HTTP 下都能跑。
