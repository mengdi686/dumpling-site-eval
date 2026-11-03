// ============================================================
//  dumpling-site-eval · engine.js  v1.4
//  纯函数引擎：无 DOM 依赖、可被 Node / 浏览器 import
//  单一事实来源：所有计算只在这里做一次，UI 只负责渲染
// ============================================================

(() => {
'use strict';

// ---------- 导出容器（浏览器: window.ENGINE, Node: module.exports） ----------
const ENGINE = {};

// ---------- 坐标工具 ----------
const PI = Math.PI, a = 6378245.0, ee = 0.00669342162296594323;
function _outOfChina(lng, lat) { return !(73.66 < lng && lng < 135.05 && 3.86 < lat && lat < 53.55); }
function _tLat(x, y) { let r = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x)); r += (20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3; r += (20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3; r += (160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3; return r; }
function _tLng(x, y) { let r = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x)); r += (20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3; r += (20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3; r += (150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3; return r; }
function wgs84ToGcj02(lng, lat) { if (_outOfChina(lng, lat)) return [lng, lat]; let dLat = _tLat(lng - 105, lat - 35), dLng = _tLng(lng - 105, lat - 35); const rLat = lat / 180 * PI, magic = Math.sin(rLat); dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * magic + (1 - ee)) * PI); dLng = (dLng * 180) / (a / Math.sqrt(1 - ee * magic * magic) * Math.cos(rLat) * PI); return [lng + dLng, lat + dLat]; }
function gcj02ToWgs84(lng, lat) { const [gLng, gLat] = wgs84ToGcj02(lng, lat); return [lng * 2 - gLng, lat * 2 - gLat]; }
function gcj02ToBd09(lng, lat) { const z = Math.sqrt(lng*lng + lat*lat) + 0.00002 * Math.sin(lat * PI * 3000 / 180); const th = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * PI * 3000 / 180); return [z * Math.cos(th) + 0.0065, z * Math.sin(th) + 0.006]; }
function bd09ToGcj02(lng, lat) { const x = lng - 0.0065, y = lat - 0.006; const z = Math.sqrt(x*x + y*y) - 0.00002 * Math.sin(y * PI * 3000 / 180); const th = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI * 3000 / 180); return [z * Math.cos(th), z * Math.sin(th)]; }
function bd09ToWgs84(lng, lat) { const [gLng, gLat] = bd09ToGcj02(lng, lat); return gcj02ToWgs84(gLng, gLat); }
function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * PI / 180; const R = 6371000;
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
Object.assign(ENGINE, { wgs84ToGcj02, gcj02ToWgs84, gcj02ToBd09, bd09ToGcj02, bd09ToWgs84, haversine });

// ---------- Mock 数据 ----------
const MOCK_SCENES = {
  community_good: {
    name: "社区旺铺",
    pois: { residential_500:{count:8}, residential_1000:{count:18}, office_500:{count:2}, school_500:{count:3}, dining_500:{count:15}, subway_500:{count:2}, competitor_direct:{count:1}, competitor_sub:{count:2} },
    household_estimate: 3800, nearest_subway_m: 180, competitor_strength: 6.2
  },
  business_warn: {
    name: "商圈中等",
    pois: { residential_500:{count:2}, residential_1000:{count:6}, office_500:{count:5}, school_500:{count:1}, dining_500:{count:25}, subway_500:{count:1}, competitor_direct:{count:4}, competitor_sub:{count:6} },
    household_estimate: 1200, nearest_subway_m: 450, competitor_strength: 7.4
  },
  remote_bad: {
    name: "偏远冷门",
    pois: { residential_500:{count:0}, residential_1000:{count:1}, office_500:{count:0}, school_500:{count:0}, dining_500:{count:0}, subway_500:{count:0}, competitor_direct:{count:0}, competitor_sub:{count:0} },
    household_estimate: 200, nearest_subway_m: null, competitor_strength: null
  }
};
Object.assign(ENGINE, { MOCK_SCENES });

// ---------- Provider 基类 + 三种实现 ----------
class Provider {
  async search_poi(lng, lat, radius, types) { throw 'abstract'; }
  async geocode(address) { throw 'abstract'; }
  async reverse_geocode(lng, lat) { throw 'abstract'; }
  name() { return 'Provider'; }
}

class MockProvider extends Provider {
  constructor(scene) { super(); this.scene = scene || "community_good"; }
  name() { return "mock"; }
  async search_poi(lng, lat, radius, types) {
    const s = MOCK_SCENES[this.scene]; if (!s) return [];
    // 中文 → code 双向 lookup（高德 API 实测码 2026-11-03）
    const CODE_MAP = {
      "住宅小区": "120300", "120300": "住宅小区",
      "商务办公楼": "120201", "写字楼": "120201", "120201": "商务办公楼",
      "学校": "141200", "大学": "141200", "141200": "学校",
      "地铁站": "150500", "轨道交通": "150500", "150500": "地铁站",
      "餐饮服务": "050000", "餐饮": "050000", "050000": "餐饮服务",
      "饺子店": "050101", "050101": "饺子店",
      "面食/面馆": "050102", "050102": "面食/面馆",
      "饺子店,面食,中式快餐": "050100|050101|050102", "050100|050101|050102": "饺子店,面食,中式快餐"
    };
    // 统一成语义名
    const semantic = CODE_MAP[types] || types;
    const map = {
      "120300": radius >= 1000 ? s.pois.residential_1000 : s.pois.residential_500,
      "住宅小区": radius >= 1000 ? s.pois.residential_1000 : s.pois.residential_500,
      "120201": s.pois.office_500, "商务办公楼": s.pois.office_500,
      "141200": s.pois.school_500, "学校": s.pois.school_500,
      "150500": s.pois.subway_500, "地铁站": s.pois.subway_500,
      "050000": s.pois.dining_500, "餐饮服务": s.pois.dining_500,
      "050101": s.pois.competitor_direct, "饺子店": s.pois.competitor_direct,
      "050102": s.pois.competitor_sub, "面食/面馆": s.pois.competitor_sub,
      "050100|050101|050102": s.pois.competitor_direct, "饺子店,面食,中式快餐": s.pois.competitor_direct, "中式快餐": s.pois.competitor_direct
    };
    const entry = map[semantic] || map[types]; if (!entry) return [];
    const out = [];
    for (let i = 0; i < entry.count; i++) {
      const a = Math.random() * 2 * PI, r = Math.random() * radius;
      out.push({
        id: "mock_" + i, name: types + "_" + i,
        lng: lng + r * Math.cos(a) / 111000,
        lat: lat + r * Math.sin(a) / 111000,
        rating: (3.5 + Math.random() * 1.8).toFixed(1),
        comment_num: Math.floor(50 + Math.random() * 800)
      });
    }
    out.__count = entry.count; // Mock：__count 等于返回条数（不模拟截断）
    return out;
  }
  async geocode(address) {
    const coords = { community_good:[116.456,39.921], business_warn:[116.408,39.914], remote_bad:[116.800,40.100] };
    return { lng: coords[this.scene][0], lat: coords[this.scene][1], formatted_address: address };
  }
  async reverse_geocode(lng, lat) { return { formatted_address: "模拟地址 " + lng.toFixed(4) + "," + lat.toFixed(4) }; }
  mockSceneExtra() { return MOCK_SCENES[this.scene]; }
}

class AmapProvider extends Provider {
  constructor(key) { super(); this.key = key; }
  name() { return "amap"; }
  async geocode(address) {
    if (!this.key) throw new Error("no key");
    const u = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(address)}&key=${this.key}`;
    const r = await (await fetch(u)).json();
    if (!r.geocodes || !r.geocodes.length) throw new Error("geocode not found");
    const [lng, lat] = r.geocodes[0].location.split(",").map(Number);
    // Amap 内部统一用 GCJ-02（Amap 原生坐标系），不做额外转换
    // 用户直接输入的坐标也是 GCJ-02，直接使用即可避免 WGS↔GCJ 二次偏移
    return { lng, lat, formatted_address: r.geocodes[0].formatted_address };
  }
  async reverse_geocode(lng, lat) {
    if (!this.key) throw new Error("no key");
    // 直接用传入坐标（GCJ-02），不做转换
    const u = `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${this.key}`;
    const r = await (await fetch(u)).json();
    return { formatted_address: (r.regeocode || {}).formatted_address || "" };
  }
  async search_poi(lng, lat, radius, types) {
    if (!this.key) throw new Error("no key");
    // 直接用传入坐标（GCJ-02），不做 WGS↔GCJ 转换
    const u = `https://restapi.amap.com/v3/place/around?location=${lng},${lat}&radius=${radius}&types=${encodeURIComponent(types)}&key=${this.key}&offset=25`;
    const r = await (await fetch(u)).json();
    const pois = (r.pois || []).map(p => {
      const [plng, plat] = p.location.split(",").map(Number);
      return { id: p.id, name: p.name, lng: plng, lat: plat, rating: p.biz_ext?.rating || null, comment_num: p.biz_ext?.comment_num || null };
    });
    // 返回 POI 数组 + count 总数（高德 count 字段为字符串）
    pois.__count = parseInt(r.count || "0", 10);
    return pois;
  }
}

class BaiduProvider extends Provider {
  constructor(key) { super(); this.key = key; }
  name() { return "baidu"; }
  async geocode(address) {
    if (!this.key) throw new Error("no key");
    const u = `https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&output=json&ak=${this.key}`;
    const r = await (await fetch(u)).json();
    if (r.status !== 0) throw new Error("geocode failed: " + r.message);
    const bd = r.result.location;
    const [gLng, gLat] = bd09ToGcj02(bd.lng, bd.lat);
    const [wLng, wLat] = gcj02ToWgs84(gLng, gLat);
    return { lng: wLng, lat: wLat, formatted_address: r.result.formatted_address };
  }
  async reverse_geocode(lng, lat) {
    if (!this.key) throw new Error("no key");
    const [bLng, bLat] = gcj02ToBd09(...wgs84ToGcj02(lng, lat));
    const u = `https://api.map.baidu.com/reverse_geocoding/v3/?location=${bLat},${bLng}&output=json&ak=${this.key}`;
    const r = await (await fetch(u)).json();
    return { formatted_address: (r.result || {}).formatted_address || "" };
  }
  async search_poi(lng, lat, radius, types) {
    if (!this.key) throw new Error("no key");
    const [bLng, bLat] = gcj02ToBd09(...wgs84ToGcj02(lng, lat));
    const u = `https://api.map.baidu.com/place/v2/search?query=${encodeURIComponent(types)}&location=${bLat},${bLng}&radius=${radius}&output=json&ak=${this.key}&page_size=20`;
    const r = await (await fetch(u)).json();
    return (r.results || []).map(p => {
      const [gLng, gLat] = bd09ToGcj02(p.location.lng, p.location.lat);
      const [wLng, wLat] = gcj02ToWgs84(gLng, gLat);
      return { id: p.uid, name: p.name, lng: wLng, lat: wLat, rating: p.detail_info?.overall_rating || null, comment_num: p.detail_info?.comment_num || null };
    });
  }
}
Object.assign(ENGINE, { Provider, MockProvider, AmapProvider, BaiduProvider });

// ---------- 缓存（localStorage，浏览器环境） ----------
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天
function makeCache(store) {
  store = store || (typeof localStorage !== 'undefined' ? localStorage : { _d:{}, getItem(k){return this._d[k]||null}, setItem(k,v){this._d[k]=v}, removeItem(k){delete this._d[k]} });
  return {
    _key(prefix, parts) { return "dumpling-cache/" + prefix + "/" + parts.join("|"); },
    get(prefix, parts) {
      try {
        const raw = store.getItem(this._key(prefix, parts));
        if (!raw) return null;
        const { v, t } = JSON.parse(raw);
        if (Date.now() - t > CACHE_TTL_MS) { store.removeItem(this._key(prefix, parts)); return null; }
        return v;
      } catch { return null; }
    },
    set(prefix, value, parts) {
      store.setItem(this._key(prefix, parts), JSON.stringify({ v: value, t: Date.now() }));
    }
  };
}
Object.assign(ENGINE, { makeCache, CACHE_TTL_MS });

// ---------- 加载品类参数卡 ----------
function loadCategory(categoryId) {
  // 内嵌默认饺子参数卡（等同 references/categories/dumpling.json）
  const defaults = {
    category_id: "dumpling",
    category_name: "饺子",
    version: "1.4",
    _changelog: "v1.4: 缺数据统一用'剔除+剩余权重归一'（不再给中性分）；compStrength 无有效评分样本→剔除 strengthS 归 density；新增 demand_bottleneck_penalty 高住户低人流冲突惩罚 5 分；lunchDaily=null 时 lunchS 剔除归一而非给 0 分",
    metrics_conversion_rate: {
      lunch_order_rate: 0.30, dinner_order_rate: 0.36, dinner_time_factor: 1.2,
      // 全链路转化率封顶：过店→进店→下单，上限 30%
      max_overall_conversion: 0.30,
      // 商圈类型下调系数（办公区午市高、社区晚市高）
      biz_type_conversion_factor: { "社区": 1.0, "商务": 0.85, "商业": 0.75, "混合": 0.9 }
    },
    // 产能硬约束（按面积/品类估算，所有营收推算必须以此封顶）
    capacity_constants: {
      seat_per_area: 0.45,          // 座位密度：0.45 座/㎡（80㎡ → 36 座）
      turnover_rate: 5,             // 翻台率：饺子馆 5 次/日
      dinein_ratio: 0.85,           // 堂食营业时段占比（10.5h 实际约 8.9h 高峰）
      takeout_ports: 2,             // 出餐口数
      takeout_per_hour: 40,         // 单口每小时产能
      takeout_hours: 6,             // 外卖有效营业小时
      area_min_for_capacity: 40,    // 小于此面积不启用产能约束（外卖档口）
      takeout_saturation_factor: 0.4 // 外卖产能保守饱和率
    },
    // 客流时段展开参数（v1.3 参数化，原硬编码 21/12.5/0.5）
    flow_expansion: {
      total_blocks: 21,             // 营业 10.5h ÷ 0.5h = 21 块
      input_blocks: 4,              // 用户给了 4 个时段
      fill_factor: 0.5              // 非输入时段人流按 50% 基线外推
    },
    // 家庭户数估算参数（v1.3 参数化，原硬编码 800/37.5/3000）
    household_estimation: {
      per_residential_poi: 800,     // house500 × 800（望京实测 21 栋 → 16800 户）
      per_area_m2: 37.5,            // area × 37.5（80㎡ → 3000 户）
      default_households: 3000      // 兜底默认中型社区
    },
    // 地铁距离 fallback（v1.3 参数化，原硬编码 500）
    subway_fallback: {
      nearest_subway_default_m: 500 // 没数据不打 0 分，给中间分
    },
    // 竞品强度计算参数（v1.3 参数化）
    competition_strength: {
      comment_log_base: 800,        // 评论数归一化对数底
      weight_substitute_factor: 0.5,// 替代竞品 dc 权重
      null_action: "exclude",       // v1.4: 无有效评分样本→剔除 strengthS，不参与归一；不再给中性分
      _usage_note: "compStrength 有效=extra传入非null/NaN 或 mainCount>0且有rated或comments样本。否则剔除 strengthS，density 按 20/10=2 归一到 competition 权重"
    },
    // 需求侧瓶颈惩罚（v1.4 新增）
    demand_bottleneck_penalty: {
      houseS_min: 8,                // houseS 需 ≥ 8（意味着 households ≥ 3000，有足够住户）
      avg_peakS_max: 4,             // lunchS 与 dinnerS 平均需 ≤ 4（意味着 lunchDaily≤25 或 dinnerDaily≤30，过店人流少）
      penalty_score: 5,             // 触发条件同时满足时 demand 侧额外扣 5 分
      _usage_note: "高住户低人流冲突：500m 户数多但实测过店少，通常是铺位不在主街，人流到不了门口。这不是需求问题是位置问题"
    },
    // v1.4: 维度权重定义（之前散落硬编码：demand_breakdown 在 demand 里 location_breakdown 在 location 里）
    weights: {
      demand: 40, location: 25, competition: 20, financial: 15,
      demand_breakdown:   { lunch_units: 15, dinner_units: 15, households: 10 },
      location_breakdown: { subway_distance: 10, walkability: 10, road_visibility: 5 },
      competition_breakdown: { density: 10, strength: 10 },
      financial_breakdown: { rent_ratio: 10, breakeven: 5 }
    },
    financial_constants: {
      avg_price_default: 30, margin_dinein_default: 0.65, margin_takeout_default: 0.54,
      labor_estimate_wan: 1.5, utility_estimate_wan: 0.5,
      fixed_cost_min_wan: 2.5, fixed_cost_max_wan: 5.0,
      break_even_dinein_min: 120, break_even_dinein_max: 240,
      break_even_takeout_min: 180, break_even_takeout_max: 350,
      // 异常检测阈值
      anomaly_thresholds: {
        rent_ratio_min: 0.03,       // 租金占营收比不得低于 3%（否则营收异常高）
        rent_ratio_max: 0.40,       // 租金占营收比不得高于 40%
        rev_per_area_max: 8000,     // 月营收/面积上限（餐饮坪效 8000 元/㎡/月）
        breakeven_achieve_max: 10,  // 盈亏达成率 > 1000% 异常
        daily_orders_max_mult: 1.10 // 日单量 > 产能上限 × 110% 异常
      }
    },
    // 竞品拆分：直接竞品（饺子 typecode 050101）+ 替代竞品（面食 typecode 050102）
    competitor_keywords: {
      direct: { amap_code: "050101", name: "饺子店" },
      substitute: { amap_code: "050102", name: "面食/面馆" },
      // 中式快餐 050100 范围太泛（含汉堡/盖饭），暂不纳入竞品
      deprecated_combined_code: "050100|050101|050102"
    },
    size_range: { target_min: 60, target_max: 100 },
    weights: {
      demand: 40, location: 25, competition: 20, financial: 15,
      demand_breakdown: { lunch_units: 15, dinner_units: 15, households: 10 },
      location_breakdown: { subway_distance: 10, walkability: 10, road_visibility: 5 },
      competition_breakdown: { density: 10, strength: 10 },
      financial_breakdown: { rent_ratio: 10, breakeven: 5 }
    }
  };
  return defaults;
}
Object.assign(ENGINE, { loadCategory });

// ---------- 指标计算 ----------
function computeAllMetrics({ wgs, pois, input, extra, category }) {
  const cat = category || loadCategory();
  const resiKey = pois.residential_500 ? "residential_500" : "residential";
  const officeKey = pois.office_500 ? "office_500" : "office";
  const schoolKey = pois.school_500 ? "school_500" : "school";
  const diningKey = pois.dining_500 ? "dining_500" : "dining";
  const subwayKey = pois.subway_500 ? "subway_500" : "subway";
  const poCount = (p) => (Array.isArray(p) && p.__count !== undefined) ? p.__count : (Array.isArray(p) ? p.length : 0);

  const house500  = poCount(pois[resiKey]);
  const office    = poCount(pois[officeKey]);
  const school    = poCount(pois[schoolKey]);
  const dining    = poCount(pois[diningKey]);
  const subway    = poCount(pois[subwayKey]);

  // ============ 竞品拆分取数 ============
  // 新版：direct(饺子 050101) + substitute(面食 050102)，分别计数
  // 兼容旧版：若只有 combined competitor 则 fallback
  const directCompPois   = pois.competitor_direct   || [];
  const subCompPois     = pois.competitor_substitute || [];
  const oldCombinedPois = pois.competitor || [];
  const directCompCount = poCount(directCompPois);
  const subCompCount    = poCount(subCompPois);
  let compCount;
  if (directCompCount > 0 || subCompCount > 0) {
    compCount = directCompCount + subCompCount;
  } else {
    compCount = poCount(oldCombinedPois);  // fallback：旧版 combined（不再推荐）
  }
  const mainPois = (directCompPois.length > 0) ? directCompPois : oldCombinedPois;
  const mainCount = (directCompCount > 0) ? directCompCount : poCount(oldCombinedPois);
  // 降级标记：是否走了空 POI fallback（影响竞争侧评分解释）
  const poiCompetitorAvailable = (directCompCount > 0 || subCompCount > 0 || poCount(oldCombinedPois) > 0);

  // ============ 家庭户数（稳定 fallback：不依赖 POI 是否存在） ============
  // 优先级：extra 显式传入 > house500*per_residential_poi > area*per_area_m2 > default
  const hhEst = cat.household_estimation || {};
  let households;
  if (extra && extra.household_estimate !== undefined && extra.household_estimate !== null) {
    households = Number(extra.household_estimate);
  } else if (house500 > 0) {
    households = Math.round(house500 * (hhEst.per_residential_poi || 800));
  } else if (input && input.area && input.area > 0) {
    households = Math.round(input.area * (hhEst.per_area_m2 || 37.5));
  } else {
    households = hhEst.default_households || 3000;
  }
  const poiHouseholdsAvailable = house500 > 0;

  // ============ 最近地铁距离（稳定 fallback） ============
  const subFb = cat.subway_fallback || {};
  let nearestSubway;
  if (extra && extra.nearest_subway_m !== undefined && extra.nearest_subway_m !== null) {
    nearestSubway = Number(extra.nearest_subway_m);
  } else if ((pois[subwayKey] || []).length > 0) {
    nearestSubway = Math.min(...pois[subwayKey].map(s => haversine(wgs.lat, wgs.lng, s.lat, s.lng)));
  } else {
    nearestSubway = subFb.nearest_subway_default_m !== undefined ? subFb.nearest_subway_default_m : 500;
  }

  // 竞品强度（稳定 fallback：不因为没 POI 就切分支）
  const compStr = cat.competition_strength || {};
  const commentLogBase = compStr.comment_log_base || 800;
  let compStrength = null;
  let compStrengthValid = false; // v1.4: 显式标记是否有有效评分数据
  if (extra && extra.competitor_strength !== undefined && extra.competitor_strength !== null) {
    compStrength = Number(extra.competitor_strength);
    compStrengthValid = !isNaN(compStrength); // 显式传入即视为有效
  } else if (mainCount > 0) {
    const rated = mainPois.filter(p => p.rating);
    const comments = mainPois.map(p=>p.comment_num).filter(Boolean);
    if (rated.length > 0 || comments.length > 0) {
      // 有有效评分样本才计算
      const avgRating = rated.length ? rated.reduce((s,p)=>s+Number(p.rating),0)/rated.length : 0;
      const avgLog = comments.length ? Math.log(comments.reduce((a,b)=>a+b,0)/comments.length + 1)/Math.log(commentLogBase) : 1;
      compStrength = Number((avgRating * avgLog).toFixed(2));
      compStrengthValid = true;
    } else {
      // mainCount>0 但 POI 数组是空的（只有 __count），rated=[] comments=[] → 视为"无有效数据"
      compStrength = null;
      compStrengthValid = false;
    }
  }
  // v1.4 规则：compStrengthValid=false → strengthS 剔除，不参与 competition 归一
  // 不再给中性分 5（违反"缺数据不加分"原则）

  // ============ 商圈类型（稳定 fallback：POI 覆盖，无 POI 用默认） ============
  let bizType;
  if (extra && extra.bizType) {
    bizType = extra.bizType;
  } else if (house500 > 0 || office > 0 || school > 0 || dining > 0 || subway > 0) {
    // 有任何 POI 数据 → 从 POI 计数推断
    bizType = inferBizType(house500, office, school, dining, subway);
  } else {
    // 完全没 POI → 默认"商业"（最保守，系数 0.75 偏低推，避免高估）
    bizType = "商业";
  }

  // ============ 产能上限 ============
  const cap = cat.capacity_constants;
  let capacityCap = null;
  if (input.area && input.area >= cap.area_min_for_capacity) {
    const seats = input.area * cap.seat_per_area;          // 80㎡ → 36 座
    const dineinCap = seats * cap.turnover_rate * cap.dinein_ratio;  // 36 × 5 × 0.85 = 153
    const takeoutCap = cap.takeout_ports * cap.takeout_per_hour * cap.takeout_hours; // 2 × 40 × 6 = 480
    // 外卖不会全饱和，取堂产 + 保守外卖 = total
    capacityCap = Math.round(dineinCap + takeoutCap * (cap.takeout_saturation_factor !== undefined ? cap.takeout_saturation_factor : 0.4));
  }

  // ============ 蹲点客流 → 日单量（重写） ============
  // 旧公式 bug：avgLunch * 150 * 0.30，150 是完全错误的时段系数
  // 新公式：4 时段均值 × 有效时段块数 × 转化率（上限 30%） × 商圈系数 → 产能封顶
  const conv = cat.metrics_conversion_rate;
  const flowExp = cat.flow_expansion || {};
  const TOTAL_BLOCKS = flowExp.total_blocks || 21;
  const INPUT_BLOCKS = flowExp.input_blocks || 4;
  const FILL_FACTOR = flowExp.fill_factor !== undefined ? flowExp.fill_factor : 0.5;
  // bizFactor 无论是否有客流都要算好（return 对象里需要它）
  const bizFactor = conv.biz_type_conversion_factor[bizType] || 1;
  let lunchDaily = null, dinnerDaily = null, dailyPassby = null;
  const anyFlow = [input.wd_lunch, input.wd_dinner, input.we_lunch, input.we_dinner].some(v => v !== null && v !== undefined);

  if (anyFlow) {
    // 1) 时段展开：4 个输入块（每块 0.5h 通行人数）+ 17 个非输入块 × 0.5 基线
    const TOTAL_BLOCKS = 21;            // 营业 10.5h ÷ 0.5h = 21 块
    const INPUT_BLOCKS = 4;             // 用户给了 4 个时段
    const FILL_FACTOR = 0.5;            // 非输入时段人流按 50% 基线外推
    const flowAvg = avgOrFallback([input.wd_lunch, input.we_lunch, input.wd_dinner, input.we_dinner], 0);
    const effectiveBlocks = INPUT_BLOCKS + (TOTAL_BLOCKS - INPUT_BLOCKS) * FILL_FACTOR; // 4 + 8.5 = 12.5
    dailyPassby = Math.round(flowAvg * effectiveBlocks);

    // 2) 午晚 50/50 分配（简化），再乘各自的转化率
    const lunchPassby  = Math.round(dailyPassby / 2);
    const dinnerPassby = dailyPassby - lunchPassby;

    // 3) 全链路转化率封顶 30%（conv.max_overall_conversion）
    // bizFactor 已在 anyFlow 外定义（保证无客流时 return 里也能拿到）
    const lunchRate  = Math.min(conv.lunch_order_rate,  conv.max_overall_conversion) * bizFactor;
    const dinnerRate = Math.min(conv.dinner_order_rate, conv.max_overall_conversion) * bizFactor * conv.dinner_time_factor;
    lunchDaily  = Math.round(lunchPassby  * lunchRate);
    dinnerDaily = Math.round(dinnerPassby * dinnerRate);

    // 4) 产能硬约束（order = min(demand, capacity)）
    if (capacityCap !== null) {
      const totalBefore = lunchDaily + dinnerDaily;
      if (totalBefore > capacityCap) {
        const ratio = capacityCap / totalBefore;
        lunchDaily  = Math.round(lunchDaily  * ratio);
        dinnerDaily = capacityCap - lunchDaily;  // 避免舍入误差
      }
    }
  }

  // ============ 财务 ============
  const price = input.price || cat.financial_constants.avg_price_default;
  const hasRent = !!(input.rent && input.rent > 0);
  let rentRatio = null, breakEvenAchieve = null, monthlyRevenue = null;
  if (hasRent && lunchDaily !== null) {
    monthlyRevenue = (lunchDaily + dinnerDaily) * price * 30;
    rentRatio = input.rent / monthlyRevenue;
  }
  let fixedCostWan = hasRent
    ? input.rent/10000 + cat.financial_constants.labor_estimate_wan + cat.financial_constants.utility_estimate_wan
    : (cat.financial_constants.fixed_cost_min_wan + cat.financial_constants.fixed_cost_max_wan) / 2;
  const breakEvenUnits = Math.round(fixedCostWan * 10000 / (price * cat.financial_constants.margin_dinein_default * 30));
  if (hasRent && lunchDaily !== null && breakEvenUnits > 0) {
    breakEvenAchieve = (lunchDaily + dinnerDaily) / breakEvenUnits;
  }

  // ============ 异常检测 ============
  // 输出前强制校验，触发任何一条则 verdict 改为"模型异常"
  const anomalies = [];
  const T = cat.financial_constants.anomaly_thresholds;
  if (lunchDaily !== null && capacityCap !== null) {
    const dailyTotal = lunchDaily + dinnerDaily;
    if (dailyTotal > capacityCap * T.daily_orders_max_mult)
      anomalies.push(`日单量 ${dailyTotal} > 产能上限 ${capacityCap} × ${(T.daily_orders_max_mult*100).toFixed(0)}%`);
  }
  if (rentRatio !== null && rentRatio < T.rent_ratio_min)
    anomalies.push(`租金占营收比 ${(rentRatio*100).toFixed(1)}% < ${(T.rent_ratio_min*100).toFixed(0)}%（营收可能异常高估）`);
  if (input.area && monthlyRevenue !== null && monthlyRevenue / input.area > T.rev_per_area_max)
    anomalies.push(`月营收坪效 ${Math.round(monthlyRevenue/input.area)} 元/㎡ > 上限 ${T.rev_per_area_max} 元/㎡/月`);
  if (breakEvenAchieve !== null && breakEvenAchieve > T.breakeven_achieve_max)
    anomalies.push(`盈亏达成率 ${(breakEvenAchieve*100).toFixed(0)}% > 上限 ${(T.breakeven_achieve_max*100).toFixed(0)}%`);

  // v1.4: 需求侧瓶颈检测（高住户低人流冲突）—— 在 computeScores 里打分，这里只收集原始数据供报告
  const flowAvg = avgOrFallback([input.wd_lunch, input.we_lunch, input.wd_dinner, input.we_dinner], null);
  const dailyPassbyRaw = dailyPassby;
  const houseHh = households;
  const diningCnt = dining;

  // v1.4: 客流时段 null/0 标记（报告区分"未测" vs "实测 0"）
  const flowNullFlags = {
    wd_lunch:  input.wd_lunch  === null || input.wd_lunch  === undefined,
    wd_dinner: input.wd_dinner === null || input.wd_dinner === undefined,
    we_lunch:  input.we_lunch  === null || input.we_lunch  === undefined,
    we_dinner: input.we_dinner === null || input.we_dinner === undefined,
    anyNull:   [input.wd_lunch, input.wd_dinner, input.we_lunch, input.we_dinner].some(v => v === null || v === undefined),
    anyZero:   [input.wd_lunch, input.wd_dinner, input.we_lunch, input.we_dinner].some(v => v === 0)
  };

  return {
    house500, office, school, dining, subway,
    compCount, directCompCount, subCompCount,
    capacityCap, dailyPassby,
    households, nearestSubway, compStrength, compStrengthValid,
    lunchDaily, dinnerDaily,
    bizType, bizFactor, hasRent, rentRatio, breakEvenUnits, breakEvenAchieve,
    price, fixedCostWan, monthlyRevenue,
    walk: input.walk, road: input.road, area: input.area,
    anomalies,
    flowNullFlags,          // v1.4: 区分"未测"null vs "实测 0"
    dailyPassbyRaw,         // v1.4: 原始过店人流（给瓶颈报告用）
    diningCnt,              // v1.4: 周边餐饮数量（给瓶颈报告用）
    // 降级标记：哪些是从真实 POI 来的，哪些走了 fallback
    poiHouseholdsAvailable,
    poiCompetitorAvailable
  };
}

function inferBizType(house500, office, school, dining, subway) {
  const scores = {
    community: house500 * 3 + school * 2,
    business:  office   * 3 + subway * 2,
    commercial: dining  * 3
  };
  const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  if (sorted.length >= 2 && sorted[0][1] - sorted[1][1] < 1) return "混合";
  return ({ community: "社区", business: "商务", commercial: "商业" })[sorted[0][0]] || "混合";
}

function avgOrFallback(arr, fb) {
  const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
  return valid.length ? valid.reduce((a,b)=>a+b,0) / valid.length : fb;
}
Object.assign(ENGINE, { computeAllMetrics, inferBizType, avgOrFallback });

// ---------- 置信度 ----------
function determineConfidence(input) {
  const vals = [input.wd_lunch, input.wd_dinner, input.we_lunch, input.we_dinner];
  const nonNull = vals.filter(v => v !== null && v !== undefined);
  const nonZero = vals.filter(v => v !== null && v !== undefined && v > 0);
  if (nonZero.length >= 4) return "A";          // 4 时段全填且 >0
  if (nonZero.length >= 1) return "B";          // 部分填（含推算值标注）
  // 全缺客流
  if (input.rent && input.rent > 0) return "D"; // 有租金但缺客流 → 可评财务但不可评需求
  return "C";                                    // 全缺客流 + 无租金 → 仅商圈画像
}
Object.assign(ENGINE, { determineConfidence });

// ---------- 评分 ----------
function scoreByMin(value, thresholds) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const sorted = [...thresholds].sort((a,b) => b.min - a.min);
  for (const t of sorted) if (value >= t.min) return t.score;
  return 0;
}
function scoreByMax(value, thresholds) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const sorted = [...thresholds].sort((a,b) => a.max - b.max);
  for (const t of sorted) if (value <= t.max) return t.score;
  return 0;
}

// ---------- 维度归一化 helper（v1.4: 统一所有缺失子项处理） ----------
// 规则：有效子项的实际分 × 放大系数（=维度总权重 / 有效子项原权重合计）
// 好处：所有有效子项的"得分占比"保持原样，只有无效子项的权重被摊薄给剩下的
function _normalizeDimension(subScores, subWeights, totalWeight) {
  // subScores: { key: actualScore } — 只有有效子项
  // subWeights: { key: originalWeight } — 所有子项的原权重
  // totalWeight: 该维度在总分里的权重（如 demand=40）
  const keys = Object.keys(subScores);
  const activeWeightSum = keys.reduce((s, k) => s + (subWeights[k] || 0), 0);
  const skippedAll = Object.keys(subWeights).filter(k => !keys.includes(k));
  if (activeWeightSum === 0) return { score: 0, skipped: skippedAll, scale: 0 };
  const scale = totalWeight / activeWeightSum;
  const rawScore = keys.reduce((s, k) => s + subScores[k], 0);
  return { score: Math.round(rawScore * scale), skipped: skippedAll, scale };
}

function computeScores(m, conf, category) {
  // v1.4 重写：所有子项统一用 normalizeDimension 处理缺失；新增瓶颈惩罚；strengthS 剔除
  const cat = category || loadCategory();
  const th = cat.scoring_thresholds || {};
  const compStrParams = cat.competition_strength || {};
  const dcSubWeight = compStrParams.weight_substitute_factor !== undefined ? compStrParams.weight_substitute_factor : 0.5;
  const weights = cat.weights || {};
  const wd = weights.demand_breakdown || { lunch_units: 15, dinner_units: 15, households: 10 };
  const wl = weights.location_breakdown || { subway_distance: 10, walkability: 10, road_visibility: 5 };
  const wc = weights.competition_breakdown || { density: 10, strength: 10 };
  const wf = weights.financial_breakdown || { rent_ratio: 10, breakeven: 5 };
  const W_DEM = weights.demand || 40, W_LOC = weights.location || 25, W_COMP = weights.competition || 20, W_FIN = weights.financial || 15;

  // --- 需求侧 ---
  const demandTh = th.demand || {};
  const lunchTh  = demandTh.lunch_daily_units  || [{min:60,score:15},{min:40,score:11},{min:25,score:7},{min:0,score:3}];
  const dinnerTh = demandTh.dinner_daily_units || [{min:72,score:15},{min:48,score:11},{min:30,score:7},{min:0,score:3}];
  const houseTh  = demandTh.household_500m     || [{min:3000,score:10},{min:1500,score:7},{min:800,score:4},{min:1,score:1},{min:0,score:0}];

  // 计算每个子项的原始分（有效数据才进 subScores）
  let lunchRaw = null, dinnerRaw = null, houseRaw = null;
  if (conf === "B") {
    const ranges = { "社区":{lunch:45,dinner:55,houses:2200}, "商务":{lunch:55,dinner:45,houses:1500}, "商业":{lunch:65,dinner:75,houses:1800}, "混合":{lunch:50,dinner:55,houses:1800} };
    const fb = ranges[m.bizType] || ranges.混合;
    lunchRaw  = fb.lunch !== null && fb.lunch !== undefined ? scoreByMin(fb.lunch, lunchTh) : null;
    dinnerRaw = fb.dinner !== null && fb.dinner !== undefined ? scoreByMin(fb.dinner, dinnerTh) : null;
    houseRaw  = scoreByMin(m.households ?? fb.houses, houseTh); // households 一定有值（fallback）
  } else {
    // v1.4: lunchDaily=null 时 lunchRaw=null（不是 0），代表"未测"而非"实测 0"
    // lunchDaily=0 时 scoreByMin(0, lunchTh) 会命中 min:0 → score:3，这是真实最低档
    lunchRaw  = m.lunchDaily !== null && m.lunchDaily !== undefined ? scoreByMin(m.lunchDaily, lunchTh) : null;
    dinnerRaw = m.dinnerDaily !== null && m.dinnerDaily !== undefined ? scoreByMin(m.dinnerDaily, dinnerTh) : null;
    houseRaw  = scoreByMin(m.households, houseTh); // households 始终有效（fallback）
  }

  // 有效子项集合
  const demandSubs = {};
  if (lunchRaw  !== null) demandSubs.lunch_units  = lunchRaw;
  if (dinnerRaw !== null) demandSubs.dinner_units = dinnerRaw;
  if (houseRaw  !== null) demandSubs.households   = houseRaw;
  const demandNorm = _normalizeDimension(demandSubs, wd, W_DEM);
  let lunchS = lunchRaw !== null ? lunchRaw : 0;
  let dinnerS = dinnerRaw !== null ? dinnerRaw : 0;
  let houseS = houseRaw !== null ? houseRaw : 0;
  let demand = demandNorm.score;
  const demandSkipped = demandNorm.skipped;

  // --- 需求侧瓶颈惩罚（v1.4 新增） ---
  const bottleneck = cat.demand_bottleneck_penalty || {};
  const BN_HOUSE_MIN = bottleneck.houseS_min !== undefined ? bottleneck.houseS_min : 8;
  const BN_AVG_PEAK_MAX = bottleneck.avg_peakS_max !== undefined ? bottleneck.avg_peakS_max : 4;
  const BN_PENALTY = bottleneck.penalty_score !== undefined ? bottleneck.penalty_score : 5;
  let bottleneckTriggered = false;
  if (houseRaw !== null && (lunchRaw !== null || dinnerRaw !== null)) {
    const peakSubs = [lunchRaw, dinnerRaw].filter(v => v !== null);
    if (peakSubs.length > 0) {
      const avgPeak = peakSubs.reduce((a, b) => a + b, 0) / peakSubs.length;
      if (houseRaw >= BN_HOUSE_MIN && avgPeak <= BN_AVG_PEAK_MAX) {
        bottleneckTriggered = true;
        demand = Math.max(0, demand - BN_PENALTY);
      }
    }
  }

  // --- 位置侧 ---
  const locTh = th.location || {};
  const subTh  = locTh.subway_distance  || [{max:200,score:10},{max:400,score:7},{max:600,score:4},{max:99999,score:1}];
  const walkMap = locTh.walkability      || { direct:10, detour_le_100:7, detour_gt_100:3, no_subway:2 };
  const roadMap = locTh.road_visibility  || { main_road_with_display:5, main_road_no_display:2, not_main_road:1 };
  const roadNullDefault = roadMap._default_null_score !== undefined ? roadMap._default_null_score : 0;

  // 位置侧三个子项：subway 有效=nearestSubway 有值（null 算无效）；walk/road 用户必填否则默认给分
  let subRaw = m.nearestSubway !== null && m.nearestSubway !== undefined ? scoreByMax(m.nearestSubway, subTh) : null;
  let walkRaw = (m.walk !== null && m.walk !== undefined) ? (walkMap[m.walk] ?? 0) : 0; // 无 walk 按最高 fallback 0 分
  let roadRaw = (m.road !== null && m.road !== undefined) ? (roadMap[m.road] ?? roadNullDefault) : roadNullDefault;

  const locSubs = {};
  if (subRaw  !== null) locSubs.subway_distance = subRaw;
  if (walkRaw !== null) locSubs.walkability     = walkRaw;
  if (roadRaw !== null) locSubs.road_visibility = roadRaw;
  const locNorm = _normalizeDimension(locSubs, wl, W_LOC);
  const subS = subRaw !== null ? subRaw : 0;
  const walkS = walkRaw !== null ? walkRaw : 0;
  const roadS = roadRaw !== null ? roadRaw : 0;
  const location = locNorm.score;
  const locSkipped = locNorm.skipped;

  // --- 竞争侧 ---
  const compTh = th.competition || {};
  const dc = (m.directCompCount !== undefined ? m.directCompCount : m.compCount)
             + Math.round((m.subCompCount || 0) * dcSubWeight);
  const realCompData = m.poiCompetitorAvailable !== false;

  // densityS 计算（v1.4 不变，dc=0 真实→10 最佳；dc 有值→按档；空 POI 降级→0）
  let densityS_raw = 0;
  if (!realCompData) {
    densityS_raw = (compTh.competitor_density_no_data && compTh.competitor_density_no_data.score !== undefined)
                   ? compTh.competitor_density_no_data.score : 0;
  } else if (dc === 0) {
    const realTh = compTh.competitor_density_real || [{dc_eq:0,score:10},{dc_max:2,score:7},{dc_max:5,score:4},{dc_max:9999,score:1}];
    densityS_raw = (realTh.find(r => r.dc_eq === 0) || {}).score || 10;
  } else if (dc <= 2) densityS_raw = 7;
  else if (dc <= 5) densityS_raw = 4;
  else densityS_raw = 1;

  // strengthS（v1.4 重写：compStrengthValid=false → 剔除 strengthS，不再给中性分）
  let strengthS_raw = null;
  const effectiveStrengthTh = compTh.competitor_strength || [{min:7.0,score:10},{min:5.0,score:6},{min:3.0,score:3},{min:0.01,score:1}];
  if (m.compStrengthValid === true) {
    // 有有效数据（extra 显式传入或 mainCount>0 且有 rating/comment 样本）
    strengthS_raw = scoreByMin(m.compStrength, effectiveStrengthTh);
  } else {
    // 无有效数据 → strengthS 剔除（不是 0 分也不是中性分）
    strengthS_raw = null;
  }

  // 竞争侧归一化
  const compSubs = {};
  if (densityS_raw !== null) compSubs.density  = densityS_raw;
  if (strengthS_raw !== null) compSubs.strength = strengthS_raw;
  const compNorm = _normalizeDimension(compSubs, wc, W_COMP);
  const densityS = densityS_raw !== null ? densityS_raw : 0;
  const strengthS = strengthS_raw !== null ? strengthS_raw : 0;
  const competition = compNorm.score;
  const compSkipped = compNorm.skipped;

  // --- 财务侧 ---
  const finTh = th.financial || {};
  const rentTh = finTh.rent_revenue_ratio     || [{max:0.15,score:10},{max:0.22,score:7},{max:0.30,score:4},{max:99,score:1}];
  const beTh   = finTh.breakeven_achievement  || [{min:1.5,score:5},{min:1.2,score:3},{min:1.0,score:1},{min:0,score:0}];
  let rentS = 0, beS = 0, financial = 0;
  if (m.hasRent) {
    const rentSubs = {};
    const rentRaw = m.rentRatio !== null ? scoreByMax(m.rentRatio, rentTh) : null;
    const beRaw = m.breakEvenAchieve !== null ? scoreByMin(m.breakEvenAchieve, beTh) : null;
    if (rentRaw !== null) rentSubs.rent_ratio = rentRaw;
    if (beRaw !== null)   rentSubs.breakeven  = beRaw;
    const finNorm = _normalizeDimension(rentSubs, wf, W_FIN);
    rentS = rentRaw !== null ? rentRaw : 0;
    beS = beRaw !== null ? beRaw : 0;
    financial = finNorm.score;
  }

  // 总分
  const rawTotal = demand + location + competition + financial;
  const displayTotal = rawTotal;

  return {
    demand, location, competition, financial,
    _rawTotal: rawTotal, _displayTotal: displayTotal, _hasRent: m.hasRent,
    _scale: m.hasRent ? 100 : 85,
    bottleneckTriggered,
    // 每个维度的归一化信息（报告里展示哪些子项被剔除）
    _norm: {
      demand:  { skipped: demandSkipped,  scale: demandNorm.scale,  beforePenalty: demandNorm.score },
      location:{ skipped: locSkipped,     scale: locNorm.scale },
      competition: { skipped: compSkipped, scale: compNorm.scale }
    },
    detail: {
      demand: { lunchS, dinnerS, houseS, max: W_DEM,
                bottleneck: bottleneckTriggered,
                skipped: demandSkipped },
      location: { subS, walkS, roadS, max: W_LOC,
                  skipped: locSkipped },
      competition: { densityS, strengthS, max: W_COMP,
                      skipped: compSkipped },
      financial: { rentS, beS, max: m.hasRent ? W_FIN : 0 }
    }
  };
}

function verdict(total, hasRent, rawTotal, anomalies, conf) {
  // anomalies 非空：不出正常结论，标记"模型异常"
  if (anomalies && anomalies.length > 0) {
    return {
      label: "🔴 模型异常，请检查输入",
      emoji: "🔴", cls: "anomaly",
      advice: "检测到以下异常指标，请核实后重跑：\n" + anomalies.map(a => "· " + a).join("\n"),
      scale: hasRent ? 100 : 85, hasRent, anomalies, isAnomaly: true
    };
  }
  // 置信度 C/D：全缺客流 → 不出"建议开/不建议"档位，改"仅商圈画像"
  if (conf === "C" || conf === "D") {
    const tier = (rawTotal ?? total) >= 60 ? "较强" : (rawTotal ?? total) >= 40 ? "中等" : "较弱";
    const parts = [];
    if (conf === "C") parts.push("仅商圈画像");
    if (conf === "D") parts.push("仅商圈画像（有租金但无客流推算）");
    return {
      label: parts[0] + " · 未经实地验证",
      emoji: "🟡", cls: "warn",
      advice: "⚠️ 未填任何四时段蹲点客流，无法推算日单量与财务健康度。当前结果仅基于 POI 商圈画像，" +
              "位置与竞争维度可作参考，但绝不可作为 '建议开/不建议' 决策依据。" +
              "\n建议：补全至少 1-2 个时段的实地客流后重跑完整评估。",
      scale: hasRent ? 100 : 85, hasRent, conf, tier,
      isVerified: false, needsFieldwork: true
    };
  }
  // 有租金：正常 100 分制，输出 ✅⚠️❌ 建议档位
  if (hasRent) {
    if (total >= 80) return { label: "建议开", emoji: "✅", cls: "pass", advice: "核心指标均达标，竞品压力可控，财务安全垫充足", scale: 100, hasRent: true };
    if (total >= 60) return { label: "谨慎", emoji: "⚠️", cls: "warn", advice: "有短板，建议补足信息后二次评估", scale: 100, hasRent: true };
    return { label: "不建议", emoji: "❌", cls: "fail", advice: "至少一个核心维度严重不达标", scale: 100, hasRent: true };
  }
  // 无租金 + conf=A/B：85 分制（demand 40 + location 25 + competition 20），只评位置维度
  const s = rawTotal ?? total;
  if (s >= 68) return { label: "位置维度：强", emoji: "🟢", cls: "pass", advice: "位置侧非常好；补上租金 + 客流后可做完整评估", scale: 85, hasRent: false };
  if (s >= 51) return { label: "位置维度：中", emoji: "🟡", cls: "warn", advice: "位置侧有亮点也有短板；补租金 + 客流后重跑", scale: 85, hasRent: false };
  return { label: "位置维度：弱", emoji: "🔴", cls: "fail", advice: "位置侧不足支撑开店判断，建议换点位", scale: 85, hasRent: false };
}
Object.assign(ENGINE, { computeScores, verdict, scoreByMin, scoreByMax });

// ---------- 业务翻译 ----------
// 把原始数值翻译成老板能懂的经营语言
function toBizLanguage(m, conf) {
  const out = {};
  // 家庭户数 → 晚餐订单潜力
  out.dinnerHouseholdOrders = {
    value: Math.round(m.households * 0.04 * 0.15), // 4% 晚餐客群 × 15% 渗透率（估算）
    method: "家庭户数 × 4% 晚餐客群 × 15% 饺子渗透率（行业经验区间）",
    confidence: "★★☆☆☆ 经验系数，需开店回测"
  };
  // 地铁距离 → 可达客流折减
  const reduction = m.nearestSubway === null ? 1.0 : Math.max(0.4, 1.0 - m.nearestSubway / 1000);
  out.subwayReduction = {
    value: (reduction * 100).toFixed(0) + "%",
    method: "地铁距离 0m=100% 可达，1000m=40% 可达，线性插值",
    confidence: "★★★☆☆ 可达性经验模型"
  };
  // 竞品 → 分流比例
  const diversion = m.compCount === 0 ? 0 : Math.min(0.6, 0.08 * m.compCount);
  out.competitionDiversion = {
    value: (diversion * 100).toFixed(0) + "%",
    method: "同品类每家 8% 分流比例，超过 6 家封顶 60%（模型简化）",
    confidence: "★★★☆☆ 需回测"
  };
  // 月营收区间
  const totalDaily = (m.lunchDaily !== null && m.dinnerDaily !== null) ? (m.lunchDaily + m.dinnerDaily) : null;
  if (totalDaily !== null) {
    const low = Math.round(totalDaily * m.price * 30 * (1 - diversion)),
          hi  = Math.round(totalDaily * m.price * 30 * (1 + diversion));
    out.revenueRange = {
      low, hi,
      method: "日单量 × 客单价 × 30 天 × (1 ± 竞品分流比例)",
      confidence: "★★★☆☆ 依赖单量估算精度"
    };
  } else {
    out.revenueRange = null;
  }
  // 回本周期（有租金时）
  if (m.hasRent && m.breakEvenAchieve !== null && m.breakEvenAchieve >= 1.2 && totalDaily !== null) {
    const fixedCostAnnual = (m.fixedCostWan * 10000) * 1.2; // 加人工水电
    const monthlyProfit = Math.round(totalDaily * m.price * 30 * 0.15); // 净利 15%
    out.paybackMonths = Math.max(1, Math.round(fixedCostAnnual / monthlyProfit));
  } else {
    out.paybackMonths = null;
  }
  return out;
}
Object.assign(ENGINE, { toBizLanguage });

// ---------- 敏感性分析 ----------
function computeSensitivity(baseInput, { rentDelta = 0, flowMult = 1, priceDelta = 0 }, category) {
  // 基于原始 engine 重算，不污染 base
  const newInput = { ...baseInput };
  if (newInput.rent !== null) newInput.rent = Math.max(0, (newInput.rent || 0) + rentDelta);
  for (const k of ['wd_lunch','wd_dinner','we_lunch','we_dinner']) {
    if (newInput[k] !== null && newInput[k] !== undefined) newInput[k] = Math.max(0, Math.round(newInput[k] * flowMult));
  }
  if (newInput.price) newInput.price = Math.max(10, newInput.price + priceDelta);

  // 这里只重新算指标和评分（POI 依赖 base，不重查）
  // 简化：只重算日单量、盈亏、评分
  // v1.3: 所有参数从卡读，和 computeAllMetrics 共用同一套系数
  const cat = category || loadCategory();
  const conv = cat.metrics_conversion_rate;
  const flowExp = cat.flow_expansion || {};
  const TOTAL_BLOCKS = flowExp.total_blocks || 21;
  const INPUT_BLOCKS = flowExp.input_blocks || 4;
  const FILL_FACTOR = flowExp.fill_factor !== undefined ? flowExp.fill_factor : 0.5;
  const effectiveBlocks = INPUT_BLOCKS + (TOTAL_BLOCKS - INPUT_BLOCKS) * FILL_FACTOR; // 12.5
  let lunchDaily = null, dinnerDaily = null;
  const anyFlow = [newInput.wd_lunch, newInput.wd_dinner, newInput.we_lunch, newInput.we_dinner].some(v => v !== null && v !== undefined);
  if (anyFlow) {
    const flowAvg = avgOrFallback([newInput.wd_lunch, newInput.we_lunch, newInput.wd_dinner, newInput.we_dinner], 0);
    const dailyPassby = Math.round(flowAvg * effectiveBlocks);
    const lunchPassby = Math.round(dailyPassby / 2);
    const dinnerPassby = dailyPassby - lunchPassby;
    // 默认用"商业"商圈系数做敏感性基准（保守推），实际项目里可以传 bizType 参数覆盖
    const bizFactor = conv.biz_type_conversion_factor[newInput.bizType] || 0.75;
    const lunchRate  = Math.min(conv.lunch_order_rate,  conv.max_overall_conversion) * bizFactor;
    const dinnerRate = Math.min(conv.dinner_order_rate, conv.max_overall_conversion) * bizFactor * conv.dinner_time_factor;
    lunchDaily  = Math.round(lunchPassby  * lunchRate);
    dinnerDaily = Math.round(dinnerPassby * dinnerRate);
  }
  return { newInput, lunchDaily, dinnerDaily };
}
Object.assign(ENGINE, { computeSensitivity });

// ---------- 首屏三块构造 ----------
function buildFirstScreen(m, scores, biz, hasRent) {
  const D = scores.detail; // 局部引用 detail
  const blocks = { earning: [], risk: [], action: [] };
  const totalDaily = (m.lunchDaily !== null && m.dinnerDaily !== null) ? (m.lunchDaily + m.dinnerDaily) : null;

  // —— 我能赚多少 ——
  if (totalDaily !== null) {
    blocks.earning.push({ label: "预计日单量区间", value: `${Math.round(totalDaily*0.75)} – ${Math.round(totalDaily*1.25)} 单`, reason: "±25% 浮动：客流估算误差 + 竞争分流" });
  }
  if (biz.revenueRange) {
    blocks.earning.push({ label: "月营业额区间", value: `${(biz.revenueRange.low/10000).toFixed(1)} – ${(biz.revenueRange.hi/10000).toFixed(1)} 万元`, reason: biz.revenueRange.method });
  }
  if (hasRent && biz.paybackMonths) {
    blocks.earning.push({ label: "回本周期", value: `约 ${biz.paybackMonths} 个月`, reason: "固定成本 ÷ 月净利 15%" });
  } else if (!hasRent) {
    blocks.earning.push({ label: "回本周期", value: "需补充租金后计算", reason: "租金是固定成本的最大变量" });
  }

  // —— 我可能亏在哪（只要 < 满分就列一条） ——
  const riskPool = [];
  if (D.location.subS < 10) {
    const nearStr = m.nearestSubway !== null ? `${Math.round(m.nearestSubway)}m` : "附近无地铁";
    riskPool.push({ name: "地铁可达性", prob: D.location.subS <= 4 ? "高" : "中",
      impact: `白领客群 ${((1 - (m.nearestSubway !== null ? Math.max(0.4, 1 - m.nearestSubway/1000) : 0))*100).toFixed(0)}% 折减`,
      detail: `最近地铁 ${nearStr}（满分 10 分，你拿 ${D.location.subS}）` });
  }
  if (D.competition.densityS < 10 || (D.competition.strengthS && D.competition.strengthS < 10)) {
    riskPool.push({ name: "周边竞品分流", prob: D.competition.densityS <= 4 ? "高" : "中",
      impact: biz.competitionDiversion.value,
      detail: `同品类 ${m.compCount} 家，竞品强度 ${m.compStrength ?? "-"}` });
  }
  if (hasRent && m.rentRatio !== null) {
    if (m.rentRatio > 0.15) riskPool.push({ name: "租金偏高", prob: m.rentRatio > 0.3 ? "高" : "中",
      impact: `${(m.rentRatio*100).toFixed(1)}% 营收被房租吃掉`,
      detail: D.financial.rentS <= 4 ? "建议跟房东谈免租期 2–3 个月" : "租金在行业安全区间内" });
  }
  if (scores.demand < 40) {
    riskPool.push({ name: "潜在客群", prob: scores.demand < 20 ? "高" : "中",
      impact: scores.demand < 20 ? `日单量可能 < 盈亏线 ${m.breakEvenUnits}` : "日单量接近盈亏线",
      detail: `500m ${m.households.toLocaleString()} 户家庭 · 商圈类型 ${m.bizType}` });
  }
  riskPool.slice(0, 3).forEach(r => blocks.risk.push(r));

  // —— 怎么规避 ——
  riskPool.slice(0, 3).forEach(r => {
    if (r.name.includes("地铁")) blocks.action.push({ risk: r.name, action: '门头做"地铁口指引"+ 外卖备注地铁口自提' });
    else if (r.name.includes("竞品")) blocks.action.push({ risk: r.name, action: '主打"薄皮大馅手工饺"差异化，或专做生饺外卖包' });
    else if (r.name.includes("租金")) blocks.action.push({ risk: r.name, action: '签 3 年合同 + 免租期 3 个月，或 60㎡ 降为 45㎡' });
    else if (r.name.includes("客群")) blocks.action.push({ risk: r.name, action: '主打"午市 12 元 6 个素饺"特价 + 小区团长合作' });
    else blocks.action.push({ risk: r.name, action: "优先做外卖 + 拼好饭，降低对过路客流依赖" });
  });

  return blocks;
}
Object.assign(ENGINE, { buildFirstScreen });

// ---------- CSV 解析（前置步骤，给 backtest/backtest.html 共用） ----------
// 经验：显式映射 + 字符串规范化，避免 BOM/空白导致静默错读
const CSV_FIELD_MAP = {
  // 自动可取字段
  city: ["城市", "city"],
  address: ["详细地址", "地址", "address"],
  lng: ["经度", "lng", "longitude"],
  lat: ["纬度", "lat", "latitude"],
  bizDist: ["商圈名", "商圈", "business_district", "biz_dist", "bizType", "商圈类型"],
  households: ["家庭户数", "households"],
  competitorStrength: ["竞品强度", "comp_strength"],
  // 必须实地字段
  area: ["使用面积", "面积", "area"],
  rent: ["月租金", "租金", "rent"],
  wd_lunch: ["工作日午市", "工作日午客流", "wd_lunch"],
  wd_dinner: ["工作日晚市", "工作日晚客流", "wd_dinner"],
  we_lunch: ["周末午市", "周末午客流", "we_lunch"],
  we_dinner: ["周末晚市", "周末晚客流", "we_dinner"],
  nearestSubway: ["地铁距离", "地铁距离m", "nearest_subway"],
  walk: ["动线类型", "动线", "walkability", "walk"],
  road: ["是否临主干道", "主干道", "road_visibility", "road"],
  // 事后结果字段
  openDate: ["实际开业日期", "开业日期", "open_date"],
  actualDailyOrders: ["实际月均日单量", "实际日单量", "actual_daily_orders"],
  actualPrice: ["实际客单价", "客单价", "actual_price"],
  survived12m: ["12个月是否存活", "是否存活", "survived_12m", "survived"],
  closeDate: ["关店日期", "close_date"]
};

function parseCSVRow(row, headerMap) {
  // 字符串规范化：去 BOM、trim、空值转 null
  const clean = v => {
    if (v === undefined || v === null) return null;
    const s = String(v).replace(/^\uFEFF/, '').trim();
    if (s === '' || s.toLowerCase() === 'null' || s === '-') return null;
    return s;
  };
  const out = {};
  for (const [engKey, candidates] of Object.entries(CSV_FIELD_MAP)) {
    for (const cn of candidates) {
      if (headerMap[cn] !== undefined) {
        const raw = clean(row[headerMap[cn]]);
        // 数值字段尝试转 number
        const numFields = ["lng","lat","area","rent","wd_lunch","wd_dinner","we_lunch","we_dinner","nearestSubway","actualDailyOrders","actualPrice"];
        if (raw !== null && numFields.includes(engKey)) {
          const n = Number(raw);
          out[engKey] = isNaN(n) ? null : n;
        } else if (raw !== null) {
          out[engKey] = raw;
        } else {
          out[engKey] = null;
        }
        break;
      }
    }
  }
  return out;
}

function buildHeaderMap(headerRow) {
  // 规范化表头（去 BOM、trim），建立 中/英列名 → 数组索引 的映射
  const cleanHeader = headerRow.map(h => String(h).replace(/^\uFEFF/, '').trim());
  const map = {};
  cleanHeader.forEach((h, i) => { map[h] = i; });
  return { cleanHeader, map };
}

// ---------- 回测（纯函数，零 DOM 依赖） ----------
function backtest(rows, categoryCard) {
  /**
   * rows: 数组，每个元素是解析后的案例对象（含 CSV_FIELD_MAP 字段）
   * categoryCard: 可选，不传时用 loadCategory() 默认饺子卡
   * returns: { rows: [...], summary: {...}, confusionMatrix: {...} }
   */
  const cat = categoryCard || loadCategory();
  const results = [];

  // 预先准备一个空 POI 集（回测走降级路径：无真实 POI 调用）
  const EMPTY_POIS = {
    residential: [], office: [], school: [], dining: [], subway: [],
    competitor_direct: [], competitor_substitute: [], competitor: []
  };

  for (const row of rows) {
    const input = {
      lng: row.lng, lat: row.lat,
      wd_lunch: row.wd_lunch, wd_dinner: row.wd_dinner,
      we_lunch: row.we_lunch, we_dinner: row.we_dinner,
      rent: row.rent, area: row.area,
      walk: row.walk || "detour_le_100",
      road: row.road || "main_road_with_display",
      price: row.actualPrice || null
    };

    // 降级 extra：优先用 row 里能拿到的字段手动覆盖
    const extra = {
      nearest_subway_m: row.nearestSubway ?? null,
      household_estimate: row.households ?? null,
      bizType: row.bizDist ?? null,  // 商圈名作为 bizType fallback
      competitor_strength: row.competitorStrength ?? null
    };
    // 也允许 row 里直接指定 bizType（更精确）
    if (row.bizType) extra.bizType = row.bizType;

    // 指标计算（走降级路径：无 POI 用 row 的商圈 fallback）
    let metrics = null, conf = null, scores = null, verdict = null, rowErrors = [];
    try {
      metrics = computeAllMetrics({ wgs: { lng: row.lng ?? 0, lat: row.lat ?? 0 }, pois: EMPTY_POIS, input, extra, category: cat });
      conf = determineConfidence(input);
      scores = computeScores(metrics, conf);
      verdict = ENGINE.verdict(scores._displayTotal, scores._hasRent, scores._rawTotal, metrics.anomalies, conf);
    } catch (e) {
      rowErrors.push(e.message);
    }

    // 实际结果映射：survived12m "是"→活；"否"/关店日期非空→死；"未到期"→不可判
    const actual = row.survived12m || (row.closeDate ? "否" : null);
    let actualBinary = null; // true=活, false=死, null=不可判
    if (actual === "是" || actual === "存活" || actual === "yes") actualBinary = true;
    else if (actual === "否" || actual === "关店" || actual === "no") actualBinary = false;
    else if (row.closeDate) actualBinary = false;
    // 未填或"未到期" → null

    // 命中判定（仅当 actualBinary 非空且 verdict 为建议开/不建议时可判）
    let hit = null; // true/false/null=不可判
    let hitReason = "";
    if (actualBinary !== null && verdict && !verdict.isAnomaly && verdict.conf !== "C" && verdict.conf !== "D") {
      const predictedOpen = verdict.label.includes("建议开");
      const predictedClose = verdict.label.includes("不建议");
      if (predictedOpen && actualBinary === true) { hit = true; hitReason = "建议开→存活"; }
      else if (predictedOpen && actualBinary === false) { hit = false; hitReason = "建议开→倒闭"; }
      else if (predictedClose && actualBinary === false) { hit = true; hitReason = "不建议→倒闭"; }
      else if (predictedClose && actualBinary === true) { hit = false; hitReason = "不建议→存活"; }
      else { hit = null; hitReason = "仅商圈画像，不可判"; }
    } else if (actualBinary === null) {
      hit = null; hitReason = "实际结果未到期或未填";
    } else if (verdict && verdict.isAnomaly) {
      hit = null; hitReason = "模型异常，跳过判定";
    } else {
      hit = null; hitReason = "置信度过低（C/D），跳过判定";
    }

    results.push({
      // 输入快照
      address: row.address, city: row.city, bizDist: row.bizDist,
      area: row.area, rent: row.rent, lng: row.lng, lat: row.lat,
      wd_lunch: row.wd_lunch, wd_dinner: row.wd_dinner,
      we_lunch: row.we_lunch, we_dinner: row.we_dinner,
      nearestSubway: row.nearestSubway, walk: row.walk, road: row.road,
      // 预测
      confidence: conf,
      predictVerdict: verdict ? verdict.label : "ERROR",
      predictScore: scores ? scores._displayTotal : null,
      predictScale: scores ? scores._scale : null,
      predictDemand: scores ? scores.demand : null,
      predictLocation: scores ? scores.location : null,
      predictCompetition: scores ? scores.competition : null,
      predictFinancial: scores ? scores.financial : null,
      anomalies: metrics && metrics.anomalies ? metrics.anomalies : [],
      // 实际
      actual: actualBinary === null ? "不可判" : (actualBinary ? "存活" : "倒闭"),
      // 命中
      hit: hit === null ? "不可判" : (hit ? "命中" : "未命中"),
      hitReason,
      errors: rowErrors
    });
  }

  // --- 汇总 ---
  const assessableRows = results.filter(r => r.hit !== "不可判");
  const openRows = assessableRows.filter(r => r.predictVerdict.includes("建议开"));
  const closeRows = assessableRows.filter(r => r.predictVerdict.includes("不建议"));
  const portraitOnly = results.filter(r => r.confidence === "C" || r.confidence === "D" || r.predictVerdict.includes("仅商圈画像"));
  const anomalyRows = results.filter(r => r.anomalies && r.anomalies.length > 0);

  const totalHit = assessableRows.filter(r => r.hit === "命中").length;
  const totalRate = assessableRows.length > 0 ? totalHit / assessableRows.length : null;
  const totalWilson = wilsonInterval(totalHit, assessableRows.length, 0.95);

  const openHit = openRows.filter(r => r.hit === "命中").length;
  const openRate = openRows.length > 0 ? openHit / openRows.length : null;
  const openWilson = openRows.length > 0 ? wilsonInterval(openHit, openRows.length, 0.95) : { low: 0, high: 1 };

  const closeHit = closeRows.filter(r => r.hit === "命中").length;
  const closeRate = closeRows.length > 0 ? closeHit / closeRows.length : null;
  const closeWilson = closeRows.length > 0 ? wilsonInterval(closeHit, closeRows.length, 0.95) : { low: 0, high: 1 };

  // 混淆矩阵（4 格）
  const confusion = {
    open_survive: openRows.filter(r => r.predictVerdict.includes("建议开") && r.actual === "存活").length,
    open_close:   openRows.filter(r => r.predictVerdict.includes("建议开") && r.actual === "倒闭").length,
    close_survive: closeRows.filter(r => r.predictVerdict.includes("不建议") && r.actual === "存活").length,
    close_close:   closeRows.filter(r => r.predictVerdict.includes("不建议") && r.actual === "倒闭").length
  };

  // 样本量告警
  let sampleAlert = null;
  if (assessableRows.length < 10) {
    sampleAlert = { level: "danger", msg: `样本不足（可判仅 ${assessableRows.length} 条），命中率不具统计意义` };
  } else if (assessableRows.length < 30) {
    sampleAlert = { level: "warn", msg: `样本偏少（${assessableRows.length} 条可判），命中率仅供参考` };
  }

  const summary = {
    total: results.length,
    assessable: assessableRows.length,
    portraitOnly: portraitOnly.length,
    anomaly: anomalyRows.length,
    sampleAlert,
    hitRate: totalRate === null ? null : Number(totalRate.toFixed(3)),
    hitWilson95: assessableRows.length > 0 ? { low: Number(totalWilson.low.toFixed(3)), high: Number(totalWilson.high.toFixed(3)) } : null,
    // 按档位分组命中率
    byTier: {
      "建议开": { count: openRows.length, hit: openHit, rate: openRate === null ? null : Number(openRate.toFixed(3)),
                  wilson95: { low: Number(openWilson.low.toFixed(3)), high: Number(openWilson.high.toFixed(3)) } },
      "不建议": { count: closeRows.length, hit: closeHit, rate: closeRate === null ? null : Number(closeRate.toFixed(3)),
                  wilson95: { low: Number(closeWilson.low.toFixed(3)), high: Number(closeWilson.high.toFixed(3)) } }
    },
    // 按置信度分组
    byConfidence: {
      "A": results.filter(r => r.confidence === "A").length,
      "B": results.filter(r => r.confidence === "B").length,
      "C": results.filter(r => r.confidence === "C").length,
      "D": results.filter(r => r.confidence === "D").length
    },
    confusionMatrix: confusion
  };

  return { rows: results, summary };
}

// CSV 工具：把 rows 转回 CSV 字符串
function backtestRowsToCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = v => {
    if (v === null || v === undefined) return "";
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h])).join(","));
  }
  return lines.join("\n");
}

// ---------- 幂等性断言 ----------
// 同一输入连跑 N 次，所有关键指标必须完全一致
function assertIdempotency(input, pois, wgs, category, extra, runs) {
  runs = runs || 3;
  const cat = category || loadCategory();
  const results = [];
  for (let i = 0; i < runs; i++) {
    const m = computeAllMetrics({ wgs, pois, input, extra, category: cat });
    const conf = determineConfidence(input);
    const s = computeScores(m, conf);
    results.push({
      demand: s.demand, location: s.location, competition: s.competition, financial: s.financial,
      total: s._rawTotal,
      bizType: m.bizType, lunchDaily: m.lunchDaily, dinnerDaily: m.dinnerDaily,
      house500: m.house500, directCompCount: m.directCompCount, subCompCount: m.subCompCount
    });
  }
  const first = JSON.stringify(results[0]);
  for (let i = 1; i < results.length; i++) {
    if (JSON.stringify(results[i]) !== first) {
      throw new Error(`幂等性断言失败！第 1 次和第 ${i+1} 次不一致：\n预期: ${first}\n实际: ${JSON.stringify(results[i])}`);
    }
  }
  return results[0];
}

// ---------- Wilson 置信区间（二项分布） ----------
function wilsonInterval(successes, total, confidence) {
  confidence = confidence || 0.95;
  if (total === 0) return { low: 0, high: 1 };
  const z = confidence === 0.99 ? 2.576 : confidence === 0.90 ? 1.645 : 1.96;
  const p = successes / total;
  const n = total;
  const denom = 1 + z*z/n;
  const center = p + z*z/(2*n);
  const spread = z * Math.sqrt((p*(1-p) + z*z/(4*n)) / n);
  return {
    low: Math.max(0, (center - spread) / denom),
    high: Math.min(1, (center + spread) / denom)
  };
}

Object.assign(ENGINE, { backtest, backtestRowsToCSV, parseCSVRow, buildHeaderMap, CSV_FIELD_MAP,
                        assertIdempotency, wilsonInterval });

// ============================================================
//  SELF-TEST：回归测试入口（v1.4 新增）
//  用途：在 index.html?selftest=1 时自动跑 fixture 断言
//  特点：所有 fixture 数据内嵌（不走 fetch），file:// 下也能跑
//  断言条数：25（v1.4）
// ============================================================
function runSelftest() {
  const assert = (cond, msg) => {
    if (!cond) throw { message: msg };
    return true;
  };
  const start = Date.now();
  const results = { pass: [], fail: [], catVersion: null };

  const test = (label, fn) => {
    try { fn(); results.pass.push(label); }
    catch (e) { results.fail.push({ label, error: e.message || String(e) }); }
  };

  // ---- fixture 数据（望京 116.4700,39.9950）----
  const input = { wd_lunch:10, wd_dinner:12, we_lunch:15, we_dinner:18,
                  rent:12000, area:80, walk:"direct", road:"main_road_with_display", price:null };
  const wgs = { lng:116.47, lat:39.995 };
  const pois = { residential:[], office:[], school:[], dining:[], subway:[],
                 competitor_direct:[], competitor_substitute:[], competitor:[] };
  pois.residential.__count = 21; pois.office.__count = 28; pois.school.__count = 6;
  pois.dining.__count = 308; pois.subway.__count = 10;
  pois.competitor_direct.__count = 1; pois.competitor_substitute.__count = 6;

  const cat = loadCategory('dumpling');
  results.catVersion = cat.version;

  // ---- 断言 ----
  test("参数卡版本 v1.4", () => assert(cat.version === "1.4", `当前 ${cat.version}`));

  const m = computeAllMetrics({ wgs, pois, input, extra:{nearest_subway_m:202}, category:cat });
  const conf = determineConfidence(input);
  const s = computeScores(m, conf, cat);
  const v = verdict(s._displayTotal, s._hasRent, s._rawTotal, m.anomalies, conf);

  test("bizType=商业", () => assert(m.bizType === "商业", `实际 ${m.bizType}`));
  test("households=16800", () => assert(m.households === 16800, `实际 ${m.households}`));
  test("nearestSubway=202", () => assert(m.nearestSubway === 202, `实际 ${m.nearestSubway}`));
  test("bizFactor=0.75", () => assert(m.bizFactor === 0.75, `实际 ${m.bizFactor}`));
  test("lunchDaily=19", () => assert(m.lunchDaily === 19, `实际 ${m.lunchDaily}`));
  test("dinnerDaily=23", () => assert(m.dinnerDaily === 23, `实际 ${m.dinnerDaily}`));
  test("dailyTotal=42", () => assert(m.lunchDaily + m.dinnerDaily === 42, `实际 ${m.lunchDaily+m.dinnerDaily}`));
  test("rentRatio=0.3175", () => assert(Math.round(m.rentRatio*10000)/10000 === 0.3175, `实际 ${m.rentRatio}`));
  test("breakEvenAchieve≈0.76", () => assert(m.breakEvenAchieve !== null && Math.round(m.breakEvenAchieve*100)/100 === 0.76, `实际 ${m.breakEvenAchieve}`));
  test("compStrengthValid=false（无有效评分样本）", () => assert(m.compStrengthValid === false, `实际 ${m.compStrengthValid}`));
  test("瓶颈惩罚触发", () => assert(s.bottleneckTriggered === true, `houseRaw=10≥8 avg(3,3)=3≤4 → 应为 true`));
  test("demand=11（瓶颈前16-5惩罚）", () => assert(s.demand === 11, `实际 ${s.demand}`));
  test("location=22", () => assert(s.location === 22, `实际 ${s.location}`));
  test("competition=8（strength剔除 density×2）", () => assert(s.competition === 8, `实际 ${s.competition}`));
  test("financial=1", () => assert(s.financial === 1, `实际 ${s.financial}`));
  test("总分=42/100", () => assert(s._rawTotal === 42, `实际 ${s._rawTotal}`));
  test("置信度 A", () => assert(conf === "A", `实际 ${conf}`));
  test("verdict=不建议", () => assert(v.label === "不建议", `实际 ${v.label}`));
  test("verdict.cls=fail", () => assert(v.cls === "fail", `实际 ${v.cls}`));
  test("verdict.scale=100", () => assert(v.scale === 100, `实际 ${v.scale}`));
  test("无异常检测", () => assert(m.anomalies.length === 0, `实际 ${m.anomalies.length}`));
  test("幂等性 3 次一致", () => {
    assertIdempotency(input, pois, wgs, cat, {nearest_subway_m:202}, 3);
  });

  // ---- 缺字段路径 ----
  const mMin = computeAllMetrics({ wgs, pois, input, extra:{}, category:cat });
  const sMin = computeScores(mMin, determineConfidence(input), cat);
  const vMin = verdict(sMin._displayTotal, sMin._hasRent, sMin._rawTotal, mMin.anomalies, "A");

  test("缺 nearest_subway_m → fallback 500", () => assert(mMin.nearestSubway === 500, `实际 ${mMin.nearestSubway}`));
  test("缺字段路径 location=19", () => assert(sMin.location === 19, `实际 ${sMin.location}`));
  test("缺字段路径总分=39", () => assert(sMin._rawTotal === 39, `实际 ${sMin._rawTotal}`));
  test("缺字段不翻转结论", () => assert(vMin.label === v.label, `完整="${v.label}" 缺字段="${vMin.label}"`));

  // ---- 汇总 ----
  results.duration = Date.now() - start;
  results.allPassed = results.fail.length === 0;
  results.total = results.pass.length + results.fail.length;
  return results;
}
ENGINE.runSelftest = runSelftest;

if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
else if (typeof window !== 'undefined') window.ENGINE = ENGINE;

})();
