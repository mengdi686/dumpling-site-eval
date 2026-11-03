# dumpling-site-eval · CHANGELOG

> 每次改权重 / 阈值 / 公式登记一行。参数卡版本号递增 +0.1。

---

## v1.4（2026-11-03）

**触发原因**：v1.3 留了三处半拉子——(1) lunchDaily=null 时 scoreByMin 返回 0 分但阈值最低档是 3，null 和 0 被混为一谈；(2) strengthS 缺数据给中性 5 分等于无条件赠送了 competition 权重的 25%（density 权重 10 不变 strength 变 5，整体涨分违反"缺数据不加分"原则）；(3) 望京 fixture 里 households=16800（满分 houseS=10）但实测每 30 分钟仅 13.75 人过店，这不是"需求不足"是"人流到不了门口"，模型没识别这个矛盾。

### 改了什么

| 类别 | 改动 | 影响子指标 | 影响分数 |
|---|---|---|---|
| **子项缺失统一归一** | 引入 `_normalizeDimension(subScores, subWeights, totalWeight)` helper；所有 4 个维度都用它处理缺失子项；统一规则：有效子项按 `score × (totalWeight / 有效权重合计)` 放大，跳过的子项不加分也不扣分 | demand.lunch/units.dinner, location.subway/walk/road, competition.density/strength, financial.rent/be | 当所有子项都有效时 scale=1，分数和 v1.3 一致；只有子项缺失时才触发归一 |
| **lunchDaily=null 不再给 0 分** | v1.3: `scoreByMin(null, th)` → 0；v1.4: lunchRaw=null（剔除），demand 按剩余子项归一；**仅当 lunchDaily=0 时才命中 min:0 → score:3**（区分"未测"vs"实测 0"） | demand.lunch_units, demand.dinner_units | conf=C/D（完全没客流）时 demand 只剩 houseS → 归一 40/10=4，households 10 分制放满 40 → demand=40（只有户数信息）|
| **strengthS 剔除（不再中性 5 分）** | v1.3: compStrengthValid→给中性 5 分；v1.4: compStrengthValid=false → strengthS 剔除，density 按 20/10=2 归一 | competition.strength, competition.density 归一系数 | 望京 fixture：competition=8（4×2），之前 v1.3 给 9（4+5），**竞争侧从 v1.3 的 9 降到 8，-1 分** |
| **新增 demand_bottleneck_penalty** | 当 houseRaw ≥ 8 且 avg(lunchRaw, dinnerRaw) ≤ 4 时 demand 侧额外扣 penalty_score=5；参数化进卡 | demand 整体（仅触发时） | 望京 fixture：16-5=11，**demand 降 5 分** |
| **新增 weights section** | 所有子项权重（demand=40/15/15/10、location=25/10/10/5、competition=20/10/10、financial=15/10/5）统一进 `cat.weights`；v1.3 散落硬编码已删除 | computeScores 全维度 | 无（数值不变）|
| **compStrengthValid 显式标记** | computeAllMetrics 返回新字段 `compStrengthValid: boolean`；判定：`extra传入非null/NaN || (mainCount>0 && (rated.length>0 || comments.length>0))`；无有效样本 → compStrength=null 且 valid=false | compStrength 计算 | fixture 里 mainCount=1 但 rated=[] comments=[] → valid=false |
| **flowNullFlags** | computeAllMetrics 返回 `flowNullFlags:{wd_lunch,wd_dinner,we_lunch,we_dinner,anyNull,anyZero}`；报告区分"未测"(null) vs"实测 0" | 报告层 | — |

### 是否影响结论档位？

**望京 fixture（完整路径）**：
- v1.3：16+22+9+1 = **48** → 不建议
- v1.4：11+22+8+1 = **42** → 不建议（-6，瓶颈惩罚 -5 + competition strength 剔除 -1）
- 结论档位：**未变**（v1.3 距 60 谨慎线 12，v1.4 距 18，仍在安全区）

**望京 fixture（缺字段路径）**：
- v1.4：11+19+8+1 = **39** → 不建议（v1.4 断言仍然全绿）

**边界安全分析**：
- strength 剔除让 competition 稳定在 density×2（最差=2 最好=20），中性 5 分让 competition 在 5~15 之间摆动 → 剔除归一让分数更**可预测**
- 瓶颈惩罚只在"高住户·低人流"冲突时触发，不会误伤正常点位
- 归一化机制让"只有 houseS 时 demand 变 40"合理（置信度已被 determineConfidence 下调到 C/D）

### 核心原则 v1.4 最终确立

> **单一事实来源 + 剔除式归一 + 缺数据不加分不扣分**：任何业务系数进参数卡；任何子项缺失→剔除+剩余权重归一；lunchDaily=0≠null；compStrength=0（算出来 avgRating=0）≠compStrength 有效；缺可选字段不得翻转结论档位。

---

## v1.3（2026-11-03）

**触发原因**：全库硬编码审计 + 缺数据加减分行为审计。发现评分阈值表在参数卡和代码 computeScores 里各有一份（且 strengthS 表不一致：参数卡 `min:0→score:7` vs 代码 `min:0→score:0`）；发现 household 估算 800/37.5/3000、nearestSubway fallback 500m、外卖产能饱和率 0.4、时段展开 21/12.5/0.5 等 7 处硬编码未参数化；发现 strengthS 在 compStrength=null 时给 0 分（最差档）是方向错误。

### 改了什么

| 类别 | 改动 | 影响子指标 | 影响分数 |
|---|---|---|---|
| **strengthS 中性化** | compStrength=null **或** =0.00 → strengthS=5（中性分，10 权重中间），不再区分 null 和 0；compStrength 有有效数据（>0.01）照常走 scoreByMin | competition.strengthS | 望京 fixture：0→5（+5） |
| **roadS 默认 0** | road=null/undefined 时从硬给 1 分 → 0 分（不再"没填道路信息反而默认有分"）；roadMap 加 `_default_null_score:0` | location.roadS | 典型无输入点位：1→0（-1） |
| **删除 computeScores 评分阈值硬写** | 所有阈值表（lunchS/dinnerS/houseS/subS/walkMap/roadMap/densityS/strengthS/rentS/beS）改为从 `cat.scoring_thresholds.*` 读取；**单一事实来源** | 全部 10 个子指标评分表 | 无（参数卡数值和之前代码一致，除 strengthS 表移除 `min:0→score:0/7` 行） |
| **参数卡补齐 7 处未参数化系数** | 新增 4 个参数卡 section：`flow_expansion`（total_blocks=21/input_blocks=4/fill_factor=0.5）、`household_estimation`（per_residential_poi=800/per_area_m2=37.5/default=3000）、`subway_fallback`（default_m=500）、`competition_strength`（comment_log_base=800/sub_weight=0.5/null_neutral_score=5）；`capacity_constants` 加 `takeout_saturation_factor=0.4` | computeAllMetrics 全链路 | 无（数值和原硬编码一致） |
| **computeSensitivity 共用同一套参数** | 删除 computeSensitivity 里 21/4/0.5 硬编码，改为从 cat.flow_expansion 读；与 computeAllMetrics 共用同一套系数 | computeSensitivity（敏感性分析） | 无 |
| **参数卡 strengthS 表修正** | 删除参数卡 `competitor_strength` 里的 `min:0→score:7`（note: "no_competitor" — 这是 v1.0 的反向逻辑），改为：有效数据阈值 `[{min:7,score:10},{min:5,score:6},{min:3,score:3},{min:0.01,score:1}]`；新增 `competitor_strength_null:{score:5}` 单独条目 | competition.strengthS 参数 | — |

### 是否影响结论档位？

**望京 fixture（完整路径）**：
- v1.2：16+22+4+1 = **43** → 不建议
- v1.3：16+22+9+1 = **48** → 不建议（+5，strengthS 中性化；未跨过 60 分谨慎线）
- 结论档位：**未变**

**望京 fixture（缺 nearest_subway_m + strength，走空 POI 降级）**：
- v1.2：16+19+0+1 = **36** → 不建议
- v1.3：16+19+9+1 = **45** → 不建议（+9，strengthS 中性化；仍未跨过 60 分）
- 结论档位：**未变**

**边界点位示例**（假设某个总分在 55-59 之间的点位）：
- strengthS 中性化可能让其涨 5 分跨过 60 分从"不建议"变"谨慎" —— 这是**合理变化**（之前把"没数据"惩罚到最差，现在给中性），不属于"结论翻转"（翻转指从"建议开"变"不建议"或反之）

### 核心原则确立（v1.3 起）

1. **单一事实来源**：任何业务系数只能出现在 `dumpling.json`（或 loadCategory 内嵌 defaults），代码里只引用卡上的值。代码里的硬编码仅限：数学常量（π、6378245）、坐标转换常量、数组 key 名、缓存 TTL 这类基础设施。
2. **缺数据不加分也不扣分**：
   - 子项无数据 → 中性分（权重一半）或跳过
   - 子项无数据 ≠ 子项最差（strengthS 不再给 0）
   - 子项无数据 ≠ 子项最佳（densityS 空 POI 不再给 10，给 0 不加分）
3. **结论档位不因缺可选字段翻转**：fixture 里显式断言（完整路径 verdict == 缺字段路径 verdict）

---

## v1.2（2026-11-03）

**触发原因**：同一输入跑出两套分（49/35），确认 bizType 默认"混合"（系数 0.9）导致 dailyTotal 虚高、空 POI densityS=10 反直觉、houseS 从 house500=0→0 导致缺分三类 bug。

### 改了什么

| 改动 | 效果 |
|---|---|
| 全零 POI 时 bizType 默认**商业**（系数 0.75），不再推断**混合**（系数 0.9） | dailyTotal 从 50→42 |
| household 优先级链：extra > house500×800 > area×37.5 > 3000；**POI 只覆盖不决定基准** | houseS 从 0→10（两条路径都命中 ≥3000 档） |
| nearestSubway 无地铁 POI 时给 fallback 500m（中间分 subS=4），不再 0 分 | subS 从 0→4 |
| 新增 poiCompetitorAvailable 降级标记；空 POI → densityS=**0**（不加分），不再 10 | densityS 从 10→0 |
| strengthS 在 compStrength=null 时给 0（不加分），不再因"无法判断"反给 7 分 | strengthS 从 7→0 |
| computeSensitivity 残留 ×150 bug 移除（重写为 effectiveBlocks=12.5） | — |
| computeAllMetrics 返回值补齐 `bizFactor` | — |
| 新增 `__count` 机制说明、幂等性断言 assertIdempotency、回归 fixture | — |

### 分数变化

- 真实 POI 路径：49→43
- 空 POI 降级路径：49→36
- 两条路径 dailyTotal 统一为 42（bizFactor 基准统一）
- demand 统一为 16（households 都 ≥3000）

---

## v1.1（2026-11-03）

**触发原因**：v1.0 望京 SOHO 跑出 84 分（结论"建议开"），实际倒闭。

### 改了什么

| 改动 | 效果 |
|---|---|
| 移除 `avgLunch * 150 * conv` 硬编码；改为 effectiveBlocks=12.5 + lunch/dinner 拆分 | 日单量 1534→42（产能硬约束封顶 350 后） |
| 新增产能上限计算（area*0.45*5*0.85 + 2*40*6*0.4） | capacityCap=350 封顶 |
| 新增全链路转化率封顶 30% | 过店→进店→下单链路不超过 30% |
| 竞品拆分为 direct（饺子 050101）+ substitute（面食 050102），dc=direct+sub×0.5 | 望京 dc=1+6×0.5=4 |
| 异常检测：日单量/租金比/坪效/盈亏达成率四条护栏 | — |

---

## v1.0（已作废 · 2026-11-03）

**公式错误**：日单量推算公式硬编码 `×150` 系数（应为有效时段块数 12.5），导致望京 SOHO 日单量虚高到 1534（物理不可能：80㎡ 36 座 × 5 翻台 = 180 堂食峰值）。

- 望京 SOHO T1：v1.0 = 84 分 → 建议开 → 实际倒闭
- 修正后回写参数卡 v1.1
- 详见 error-log-template.csv 第一条记录
