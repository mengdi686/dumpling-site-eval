# 🥟 饺子馆选址评估 · dumpling-site-eval

纯前端饺子馆选址评估工具。双击 HTML 就能用，不需要 Node 也不需要 Python。

---

## 这是什么？

输入一个地址、租金、面积和四时段蹲点客流，输出一份完整的饺子馆选址评估报告（三维得分 + 建议 + 老板视角结论卡）。可以离线用（Mock 数据），有高德/百度 API key 后直接拉真实 POI。

**模型版本**：v1.4（2026-11-03）—— 定版，27 条内嵌回归断言。

## 快速开始（5 秒）

```powershell
# 方式 A：双击（最简单，离线用 Mock 数据）
# Windows 资源管理器 → 双击 scripts/index.html

# 方式 B：启动本地 HTTP 服务（支持 API key 真实查询）
# 复制下面整段到 PowerShell 回车即可：
powershell -NoProfile -Command "
`$root = '$(Get-Location)\scripts'
`$listener = [System.Net.HttpListener]::new()
`$listener.Prefixes.Add('http://localhost:8765/')
`$listener.Start()
Write-Host '✅ 已启动：http://localhost:8765/scripts/index.html'
Write-Host '🔍 自检入口：http://localhost:8765/scripts/index.html?selftest=1'
while (`$listener.IsListening) {
  `$ctx = `$listener.GetContext()
  `$path = `$ctx.Request.Url.AbsolutePath -replace '^/',''
  `$file = Join-Path `$root `$path
  if (Test-Path `$file -PathType Leaf) {
    `$bytes = [IO.File]::ReadAllBytes(`$file)
    `$ctx.Response.ContentType = switch ([IO.Path]::GetExtension(`$file)) {
      '.html' { 'text/html;charset=utf-8' }
      '.js'   { 'application/javascript;charset=utf-8' }
      '.json' { 'application/json;charset=utf-8' }
      '.csv'  { 'text/csv;charset=utf-8' }
      default { 'application/octet-stream' }
    }
    `$ctx.Response.ContentLength64 = `$bytes.Length
    `$ctx.Response.OutputStream.Write(`$bytes, 0, `$bytes.Length)
  } else { `$ctx.Response.StatusCode = 404 }
  `$ctx.Response.Close()
}"
```

| 页面 | 地址 | 说明 |
|---|---|---|
| 主评估页 | `scripts/index.html` | 表单 + 报告渲染 |
| **自检入口** | `scripts/index.html?selftest=1` | 页面加载自动跑 27 条回归断言，全绿显示绿色横幅，失败显示红色 |
| 回测页 | `scripts/backtest.html` | 导入 CSV 批量跑历史点位，输出命中率 + Wilson 置信区间 |

## 回测（历史点位批量评估）

1. 打开 `scripts/backtest.html`
2. 点「导入 CSV」，选 `references/case-library-template.csv`（已填好样例行）
3. 每一行是一个真实点位，**必须带存活/倒闭标签**（`survive` 列 `yes/no`），否则命中率无法计算
4. 运行后输出：每个点位的评估结果 + 整体命中率 + Wilson 95% 置信区间 + 混淆矩阵

## 目录结构

```
dumpling-site-eval/
├── .gitignore                          ← 忽略 node_modules / log / env / fixtures
├── README.md                           ← 你正在读的
├── SKILL.md                            ← Agent 执行说明（面向 Trae 等智能体）
├── references/
│   ├── CHANGELOG.md                    ← 参数卡版本变更日志（v1.0 → v1.4）
│   ├── error-log-template.csv          ← 错误案例记录模板（含 v1.0 望京 SOHO 作废案例）
│   ├── case-library-template.csv       ← 回测 CSV 模板
│   ├── metrics.md                      ← 16 个指标口径手册
│   ├── scoring-model.md                ← 评分模型 + 参数卡 + 置信度定义
│   ├── 案例库填写说明.md                ← 如何采集真实点位做回测
│   └── categories/
│       └── dumpling.json               ← 饺子品类参数卡（v1.4，所有业务系数在这里）
├── scripts/
│   ├── engine.js                       ← 核心引擎（纯函数 IIFE · 内嵌 runSelftest 27 条断言）
│   ├── index.html                      ← 主评估页（表单 + 报告 + ?selftest=1 自检）
│   ├── backtest.html                   ← 回测页（CSV 导入 + 批量评估）
│   ├── regression-fixture.js           ← 独立 fixture（可 console eval 手动跑，已内嵌进 engine.js）
│   └── assess.html                     ← v1.0 旧版备份
└── examples/
    └── README.txt                      ← 三个合成示例的运行说明
```

## 改参数卡 / 升级版本号（3 步）

**所有评分阈值和业务系数都在 `references/categories/dumpling.json` 里。改完后**：

1. **两处同步**：改 `dumpling.json` 的同时，同步改 `scripts/engine.js` 里 `loadCategory()` 内嵌的 defaults（打开 engine.js 搜 `version: "1.4"`，上面的注释块就是内嵌参数卡）
2. **版本号 +0.1**：`category.version` 字段（两个文件都要改）
3. **CHANGELOG 记一笔**：`references/CHANGELOG.md` 加条目——改了什么 / 影响哪些子指标 / 是否翻转结论档位
4. **跑自检**：硬刷新页面 → 打开 `?selftest=1` 看全绿

## 当前模型版本 v1.4 权威分

**望京 116.4700,39.9950 / 80㎡ / 租金12000 / 四时段客流 10,12,15,18**：

```
需求侧 11/40（瓶颈惩罚 -5：住户 16800 足够但实测每 30min 仅 13.75 人过店 → houseRaw=10 ≥ 8
                且 avg(lunchS=3, dinnerS=3)=3 ≤ 4 → 扣 5 分）
位置侧 22/25（地铁 202m·subS=7 + 直连·walkS=10 + 主干道展示·roadS=5）
竞争侧 8/20（dc=4·densityS=4 × 归一系数 20/10=2；strength 剔除无有效评分样本）
财务侧 1/15（租金比 31.75%→rentS=1；盈亏达成 76%→beS=0）
───────────────────────────────────────
总分 42/100  ❌ 不建议  ·  置信度 A  ·  幂等 3 次一致
```

## 已知限制 / 风险

| # | 项目 | 现状 | 影响 |
|---|---|---|---|
| 1 | **无正样本验证（TP=0）** | 还没收集到 ≥10 家存活店的真实数据回测 | 模型的推荐边界未经实战检验；v1.0 曾因硬编码 bug 把倒闭店评成 84 分"建议开" |
| 2 | 无 Node/Python 环境 | 不能用 npm test / pytest | 自检入口 `?selftest=1` 是唯一的回归保险 |
| 3 | file:// 下高德 API CORS | 浏览器拦截跨域请求 | 自动回落 MockProvider，离线用也能跑，但不能拿到真实 POI |
| 4 | 竞品强度剔除 | v1.4 规定无有效评分数据时 strengthS 剔除归 density 归一 | **所有**点位默认 density 权重翻倍；有真实评分时才还原为 density+strength 各 10 |
| 5 | 产能硬约束 | `capacityCap = seat_per_area × area × turnover × dinein + takeout × saturation`；area < 40㎡ 不启用 | 面积过小时日单量推算可能偏高 |
| 6 | 商圈类型自动推断 | 无 POI 覆盖时默认"商业"系数 0.75（保守） | 偏远地区没有足够写字楼时，bizFactor 可能偏低 |

## 输出说明

| 输出 | 位置 | 说明 |
|---|---|---|
| 完整 HTML 报告 | 点「下载报告 HTML」按钮 | 单文件、离线可开、分享友好 |
| 终端结论卡 | 报告末尾「终端结论卡」区域 | 纯文本、可复制、给 Agent 或老板看 |
| CSV 批量结果 | backtest.html 导出 | Wilson 置信区间 + 混淆矩阵 |
| 自检报告 | 页面顶部横幅（`?selftest=1`） | 27 条断言 + 耗时 + 版本号 |

## 许可证

内部工具，仅供选址参考。最终决策请结合实地走访。
