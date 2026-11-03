// 回归测试 fixture — 望京 116.4700,39.9950
// v1.4 版本：缺数据统一用"剔除+剩余权重归一"；compStrengthValid=false → strengthS 剔除；
//           新增 demand_bottleneck_penalty：houseS≥8 且 lunchS/dinnerS 平均≤4 扣 5 分
// 权威分：demand=11(含瓶颈惩罚-5) / location=22 / competition=8(strengthS剔除 density×2) / financial=1 = 42/100
// 任何改动破坏这条 fixture 都必须失败
function runRegression_Wangjing() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error("FAIL: " + msg);
    console.log("  ✅ " + msg);
  };
  console.log("=== Regression Fixture: 望京 116.4700,39.9950  v1.4 ===");

  const cat = ENGINE.loadCategory('dumpling');
  assert(cat.version === "1.4", `参数卡版本 v1.4 (当前 ${cat.version})`);

  const input = {
    wd_lunch:10, wd_dinner:12, we_lunch:15, we_dinner:18,
    rent:12000, area:80, walk:"direct",
    road:"main_road_with_display", price:null
  };
  const wgs = { lng:116.47, lat:39.995 };
  // 真实 POI：radius=500m 实测 count
  // 重要：__count 必须挂在数组对象**本身**上（AmapProvider 就是这么做的）
  const pois = {
    residential:[], office:[], school:[], dining:[], subway:[],
    competitor_direct:[], competitor_substitute:[], competitor:[]
  };
  pois.residential.__count = 21;
  pois.office.__count = 28;
  pois.school.__count = 6;
  pois.dining.__count = 308;
  pois.subway.__count = 10;
  pois.competitor_direct.__count = 1;
  pois.competitor_substitute.__count = 6;

  const m = ENGINE.computeAllMetrics({ wgs, pois, input, extra:{nearest_subway_m:202}, category:cat });
  const conf = ENGINE.determineConfidence(input);
  const s = ENGINE.computeScores(m, conf, cat);
  const v = ENGINE.verdict(s._displayTotal, s._hasRent, s._rawTotal, m.anomalies, conf);

  // ===== 子指标断言 =====
  assert(m.bizType === "商业", `bizType=商业 (实际 ${m.bizType})`);
  assert(m.households === 16800, `households=16800 (实际 ${m.households})`);
  assert(m.nearestSubway === 202, `nearestSubway=202m (实际 ${m.nearestSubway})`);
  assert(m.bizFactor === 0.75, `bizFactor=0.75 (实际 ${m.bizFactor})`);
  assert(m.lunchDaily === 19, `lunchDaily=19 (实际 ${m.lunchDaily})`);
  assert(m.dinnerDaily === 23, `dinnerDaily=23 (实际 ${m.dinnerDaily})`);
  assert(m.lunchDaily + m.dinnerDaily === 42, `dailyTotal=42 (实际 ${m.lunchDaily+m.dinnerDaily})`);
  assert(Math.round(m.rentRatio*10000)/10000 === 0.3175, `rentRatio=0.3175 (实际 ${m.rentRatio})`);
  assert(m.breakEvenAchieve !== null && Math.round(m.breakEvenAchieve*100)/100 === 0.76, `breakEvenAchieve≈0.76 (实际 ${m.breakEvenAchieve})`);

  // ===== v1.4 compStrength 有效标记 =====
  // fixture 里 competitor_direct 有 __count=1 但数组空 → mainCount>0 但 rated=[] comments=[] → 无有效评分样本
  // v1.4: compStrengthValid=false → strengthS 剔除，densityS × (20/10) = densityS × 2
  assert(m.compStrengthValid === false, `compStrengthValid=false（无有效评分样本，实际 ${m.compStrengthValid}）`);
  assert(s.detail.competition.skipped.includes("strength"), `competition skipped 包含 strength（实际 ${JSON.stringify(s.detail.competition.skipped)}）`);
  assert(s.detail.competition.densityS === 4, `densityS=4 (dc=4 ∈ [3,5], 实际 ${s.detail.competition.densityS})`);
  assert(s.detail.competition.strengthS === 0, `strengthS 剔除 → 展示 0 (实际 ${s.detail.competition.strengthS})`);

  // ===== 四维分断言（v1.4 权威值） =====
  // demand_norm = 16 (3+3+10, scale=40/40=1) → 瓶颈惩罚 -5 → 11
  // location = 7+10+5=22 (scale=25/25=1)
  // competition = 4 × 2 = 8 (只有 density 有效, scale=20/10=2)
  // financial = 1+0=1 (scale=15/15=1)
  assert(s.demand === 11, `需求侧=11（含瓶颈惩罚-5，before_penalty=16，实际 ${s.demand}）`);
  assert(s.location === 22, `位置侧=22 (实际 ${s.location})`);
  assert(s.competition === 8, `竞争侧=8（density=4 归一 scale=2，实际 ${s.competition}）`);
  assert(s.financial === 1, `财务侧=1 (实际 ${s.financial})`);

  // ===== 瓶颈惩罚断言 =====
  assert(s.bottleneckTriggered === true, `瓶颈惩罚触发（高住户 houseRaw=10 ≥ 8 且 avg(3,3)=3 ≤ 4，实际 ${s.bottleneckTriggered}）`);
  assert(s._norm.demand.beforePenalty === 16, `demand_beforePenalty=16（瓶颈前 demand=16，实际 ${s._norm.demand.beforePenalty}）`);
  assert(s._norm.demand.scale === 1, `demand_scale=1（三个子项都有效，实际 ${s._norm.demand.scale}）`);

  // ===== 总分 =====
  assert(s._rawTotal === 42, `总分=42/100 (demand=11 + loc=22 + comp=8 + fin=1，实际 ${s._rawTotal})`);

  // ===== 置信度 =====
  assert(conf === "A", `置信度=A (实际 ${conf})`);

  // ===== Verdict =====
  assert(v.label === "不建议", `verdict="不建议" (实际 ${v.label})`);
  assert(v.cls === "fail", `verdict.cls="fail" (实际 ${v.cls})`);
  assert(v.scale === 100, `verdict.scale=100 (实际 ${v.scale})`);
  assert(m.anomalies.length === 0, `无异常检测触发 (实际 ${m.anomalies.length})`);

  // ===== 幂等性断言 =====
  ENGINE.assertIdempotency(input, pois, wgs, cat, {nearest_subway_m:202}, 3);
  console.log("  ✅ 幂等性 3 次一致");

  // ===== 缺可选字段稳定性：无 nearest_subway_m + 无 competitor_strength =====
  console.log("  --- 缺可选字段稳定性测试 ---");
  const poisMinimal = {
    residential:pois.residential, office:pois.office, school:pois.school,
    dining:pois.dining, subway:pois.subway,
    competitor_direct:pois.competitor_direct, competitor_substitute:pois.competitor_substitute,
    competitor:pois.competitor
  };
  const mMin = ENGINE.computeAllMetrics({ wgs, pois:poisMinimal, input, extra:{}, category:cat });
  const sMin = ENGINE.computeScores(mMin, ENGINE.determineConfidence(input), cat);
  const vMin = ENGINE.verdict(sMin._displayTotal, sMin._hasRent, sMin._rawTotal, mMin.anomalies, "A");

  // nearestSubway fallback 500 → subS=4（scale=25/25=1，三个位置子项都有效）→ location = 4+10+5=19
  // demand/competition/financial 不变
  assert(mMin.nearestSubway === 500, `缺 nearest_subway_m → fallback 500 (实际 ${mMin.nearestSubway})`);
  assert(sMin.location === 19, `location=19（sub=4 fallback 500m，实际 ${sMin.location}）`);
  assert(sMin.competition === 8, `competition=8（strength 剔除 density×2 归一，实际 ${sMin.competition}）`);
  assert(sMin.demand === 11, `demand 仍是 11（瓶颈惩罚同样触发，实际 ${sMin.demand}）`);
  console.log(`    完整路径：${s._rawTotal} 分 → ${v.label}`);
  console.log(`    缺 subway：${sMin._rawTotal} 分 (loc=${sMin.location}) → ${vMin.label}`);
  assert(sMin._rawTotal === 39, `缺字段路径总分=39 (11+19+8+1，实际 ${sMin._rawTotal})`);
  assert(vMin.label === v.label, `结论档位不得翻转！完整="${v.label}", 缺字段="${vMin.label}"`);

  console.log("");
  console.log("====================");
  console.log("🎉 全部断言通过！");
  console.log("  参数卡: v1.4");
  console.log("  demand 11(瓶颈-5) + location 22 + competition 8(strength剔除) + financial 1 = 42/100");
  console.log("  verdict: 不建议 / fail / 置信度 A");
  console.log("  瓶颈提示：households≈16800, dining=308, 实测过店≈13.75人/30min → 高住户低人流");
  console.log("====================");
  return { metrics:m, scores:s, verdict:v, minimal:{metrics:mMin, scores:sMin, verdict:vMin} };
}

if (typeof ENGINE !== 'undefined') ENGINE.runRegression_Wangjing = runRegression_Wangjing;
