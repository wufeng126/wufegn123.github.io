/**
 * 国内天气服务层
 *
 * 数据源优先级（依次尝试，全部失败返回 null）：
 * 1. 和风天气 QWeather（可选，需配置 QWEATHER_API_KEY，国内主流、支持任意城市名）
 * 2. 中国天气网 weather.com.cn（免费、国内直连、无需 Key，内置常用城市代码映射表）
 * 3. wttr.in（国外兜底，仅当国内源不可用时）
 *
 * 统一返回 WeatherData 结构（与前端 WeatherInfo 兼容）：
 * - condition      英文代码（Clear/Clouds/Rain/...）
 * - conditionLabel 中文（晴/多云/雨/...）
 * - conditionIcon  emoji
 * - temperature    摄氏度
 * - humidity       湿度 %
 * - windSpeed      风速 km/h
 * - windDirection  风向（东南风）
 * - windLevel      风力等级描述
 * - wind           人类可读（"3级 东南风"）
 * - city           城市名
 */

export type WeatherData = {
  condition: string;
  conditionLabel: string;
  conditionIcon: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  windLevel: string;
  /** 兼容前端展示：人类可读风力描述（如 "3级 东南风"） */
  wind: string;
  city: string;
};

/** 天气状况映射（英文代码 → 中文 + 图标） */
export const WEATHER_CONDITION_MAP: Record<string, { label: string; icon: string }> = {
  'Clear': { label: '晴', icon: '☀️' },
  'Clouds': { label: '多云', icon: '⛅' },
  'Overcast': { label: '阴', icon: '☁️' },
  'Rain': { label: '雨', icon: '🌧️' },
  'Drizzle': { label: '小雨', icon: '🌦️' },
  'Thunderstorm': { label: '雷暴', icon: '⛈️' },
  'Snow': { label: '雪', icon: '🌨️' },
  'Mist': { label: '薄雾', icon: '🌫️' },
  'Fog': { label: '雾', icon: '🌫️' },
  'Haze': { label: '霾', icon: '😶‍🌫️' },
  'Dust': { label: '沙尘', icon: '🌪️' },
};

/** 中文天气现象 → 英文代码（QWeather / 中央气象台返回中文，需归一化） */
function mapChineseCondition(text: string): string {
  const t = String(text || '').trim();
  if (!t) return 'Clouds';
  if (t.includes('雷')) return 'Thunderstorm';
  if (t.includes('雪')) return 'Snow';
  if (t.includes('暴雨') || t.includes('大雨') || t.includes('中雨') || t.includes('小雨') || t.includes('阵雨')) {
    return t.includes('小雨') || t.includes('阵雨') ? 'Drizzle' : 'Rain';
  }
  if (t.includes('雨')) return 'Rain';
  if (t.includes('霾')) return 'Haze';
  if (t.includes('沙尘') || t.includes('扬沙') || t.includes('浮尘')) return 'Dust';
  if (t.includes('雾')) return 'Fog';
  if (t.includes('阴')) return 'Overcast';
  if (t.includes('云') || t.includes('多云')) return 'Clouds';
  if (t.includes('晴')) return 'Clear';
  return 'Clouds';
}

/** 风力等级表：等级 → 描述（用于 windLevel 字段） */
const WIND_LEVEL_NAMES = ['无风', '软风', '轻风', '微风', '和风', '清风', '强风', '疾风', '大风', '烈风', '狂风', '暴风', '飓风'];

/** 蒲福风级：各级风速下限（km/h），index+1 = 等级 */
const WIND_LEVEL_SPEED_THRESHOLDS = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];

/** 由风速(km/h)推风力等级描述（0-12 级，按蒲福风级区间） */
export function getWindLevel(speed: number): string {
  const s = Math.max(speed, 0);
  let level = 0;
  for (let i = 0; i < WIND_LEVEL_SPEED_THRESHOLDS.length; i += 1) {
    if (s >= WIND_LEVEL_SPEED_THRESHOLDS[i]) level = i + 1;
  }
  return WIND_LEVEL_NAMES[level];
}

/** 由风力等级数字 → 等级描述（中央气象台直接给 0-12 级） */
function windLevelNameFromScale(scale: number): string {
  const idx = Math.min(Math.max(Math.round(scale), 0), 12);
  return WIND_LEVEL_NAMES[idx];
}

function buildWeatherData(input: {
  conditionText: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  windScale?: number;
  city: string;
}): WeatherData {
  const condition = mapChineseCondition(input.conditionText);
  const info = WEATHER_CONDITION_MAP[condition] || { label: input.conditionText || '未知', icon: '🌤️' };
  const windLevel = input.windScale != null && input.windScale > 0
    ? windLevelNameFromScale(input.windScale)
    : getWindLevel(input.windSpeed);
  const wind = [
    input.windScale != null && input.windScale > 0 ? `${Math.round(input.windScale)}级` : '',
    windLevel,
    input.windDirection,
  ].filter(Boolean).join(' ') || '无风';
  return {
    condition,
    conditionLabel: info.label,
    conditionIcon: info.icon,
    temperature: Math.round(input.temperature),
    humidity: Math.round(input.humidity),
    windSpeed: input.windSpeed,
    windDirection: input.windDirection || '',
    windLevel,
    wind,
    city: input.city,
  };
}

/** 常用城市 → 中国天气网城市代码（weather.com.cn，与中央气象台同一套代码体系） */
const CHINA_CITY_CODES: Record<string, string> = {
  '北京': '101010100', '天津': '101030100', '上海': '101020100', '重庆': '101040100',
  '广州': '101280101', '深圳': '101280601', '佛山': '101280800', '东莞': '101281601',
  '珠海': '101280701', '惠州': '101280301', '中山': '101281701', '江门': '101281101',
  '杭州': '101210101', '宁波': '101210401', '温州': '101210701', '嘉兴': '101210301',
  '绍兴': '101210501', '金华': '101210901', '台州': '101210601', '湖州': '101210201',
  '南京': '101190101', '苏州': '101190401', '无锡': '101190201', '常州': '101191101',
  '南通': '101190501', '徐州': '101190801', '扬州': '101190601', '镇江': '101190301',
  '武汉': '101200101', '宜昌': '101200901', '襄阳': '101200201', '黄石': '101200301',
  '成都': '101270101', '绵阳': '101270401', '德阳': '101272001', '宜宾': '101271101',
  '西安': '101110101', '咸阳': '101110200', '宝鸡': '101110901', '郑州': '101180101',
  '洛阳': '101180901', '长沙': '101250101', '株洲': '101250301', '南昌': '101240101',
  '合肥': '101220101', '芜湖': '101220301', '福州': '101230101', '厦门': '101230201',
  '泉州': '101230501', '漳州': '101230601', '济南': '101120101', '青岛': '101120201',
  '烟台': '101120501', '威海': '101121301', '沈阳': '101070101', '大连': '101070201',
  '长春': '101060101', '哈尔滨': '101050101', '石家庄': '101090101', '唐山': '101090501',
  '保定': '101090201', '太原': '101100101', '呼和浩特': '101080101', '南宁': '101300101',
  '桂林': '101300501', '海口': '101310101', '三亚': '101310201', '昆明': '101290101',
  '贵阳': '101260101', '兰州': '101160101', '西宁': '101150101', '银川': '101170101',
  '乌鲁木齐': '101130101', '拉萨': '101140101', '澳门': '101330101', '香港': '101320101',
};

/** 从用户输入解析城市代码（支持 "北京" / "北京市" / "江苏苏州"） */
function resolveChinaCityCode(city: string): string | null {
  if (!city) return null;
  const name = String(city).trim().replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
  // "江苏苏州" → 取最后一段城市名
  if (name.length > 3) {
    const candidates = [name.slice(2), name.slice(3)];
    for (const c of candidates) {
      if (CHINA_CITY_CODES[c]) return CHINA_CITY_CODES[c];
    }
  }
  return CHINA_CITY_CODES[name] || null;
}

/** 数据源 1：和风天气 QWeather（可选，需 QWEATHER_API_KEY） */
async function fetchWeatherFromQWeather(city: string): Promise<WeatherData | null> {
  const apiKey = process.env.QWEATHER_API_KEY;
  if (!apiKey) return null;
  const host = process.env.QWEATHER_API_HOST || 'https://devapi.qweather.com';
  try {
    const url = `${host}/v7/weather/now?location=${encodeURIComponent(city)}&lang=zh`;
    const response = await fetch(url, {
      headers: { 'X-QW-Api-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.code !== '200' || !data?.now) return null;
    const now = data.now;
    return buildWeatherData({
      conditionText: now.text || '多云',
      temperature: parseFloat(now.temp) || 0,
      humidity: parseFloat(now.humidity) || 0,
      windSpeed: parseFloat(now.windSpeed) || 0,
      windDirection: now.windDir || '',
      windScale: parseFloat(now.windScale) || 0,
      city,
    });
  } catch {
    return null;
  }
}

/** 数据源 2：中国天气网 weather.com.cn（免费、国内直连、无需 Key） */
async function fetchWeatherFromWeatherCn(city: string): Promise<WeatherData | null> {
  const cityCode = resolveChinaCityCode(city);
  if (!cityCode) return null;
  try {
    const url = `http://d1.weather.com.cn/sk_2d/${cityCode}.html?_=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Referer': 'http://www.weather.com.cn/',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    // 返回格式：var dataSK={...};
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const data = JSON.parse(text.slice(start, end + 1));
    if (!data?.weather) return null;

    const windScale = parseFloat(String(data.WS || '').replace(/[^\d.]/g, '')) || 0;
    const windSpeed = parseFloat(String(data.wse || '').replace(/[^\d.]/g, '')) || 0;
    return buildWeatherData({
      conditionText: data.weather || '多云',
      temperature: parseFloat(data.temp) || 0,
      humidity: parseFloat(String(data.SD || '').replace(/[^\d.]/g, '')) || 0,
      windSpeed,
      windDirection: data.WD || '',
      windScale,
      city: data.cityname || city,
    });
  } catch {
    return null;
  }
}

/** 数据源 3：wttr.in（国外兜底，保留原逻辑） */
async function fetchWeatherFromWttr(city: string): Promise<WeatherData | null> {
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      headers: { 'User-Agent': 'ConstructionLog/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const current = data?.current_condition?.[0];
    if (!current) return null;
    const windSpeed = parseFloat(current.windspeedKmph) || 0;
    const windDirection = current.winddir16Point || '';
    return buildWeatherData({
      conditionText: current.weatherDesc?.[0]?.value || (current.weatherCode ? mapWttrCode(current.weatherCode) : '多云'),
      temperature: parseFloat(current.temp_C) || 0,
      humidity: parseInt(current.humidity) || 0,
      windSpeed,
      windDirection,
      city: data?.nearest_area?.[0]?.areaName?.[0]?.value || city,
    });
  } catch {
    return null;
  }
}

/** wttr.in 数字代码 → 中文（近似） */
function mapWttrCode(code: string): string {
  const n = parseInt(code);
  if (n >= 113 && n <= 116) return '晴';
  if (n >= 119 && n <= 122) return '多云';
  if (n >= 143 && n <= 146) return '薄雾';
  if (n >= 176 && n <= 182) return '阵雨';
  if (n >= 227 && n <= 232) return '雪';
  if (n >= 263 && n <= 266) return '小雨';
  if (n >= 293 && n <= 314) return '雨';
  if (n >= 317 && n <= 338) return '雪';
  if (n >= 350 && n <= 359) return '阵雨';
  if (n >= 371 && n <= 395) return '雪';
  return '多云';
}

/**
 * 获取天气（按数据源优先级自动降级）
 * 优先顺序：和风天气（配 Key）→ 中国天气网（国内免费）→ wttr.in（国外兜底）
 */
export async function fetchWeatherData(city: string): Promise<WeatherData | null> {
  const sources: Array<() => Promise<WeatherData | null>> = [
    () => fetchWeatherFromQWeather(city),
    () => fetchWeatherFromWeatherCn(city),
    () => fetchWeatherFromWttr(city),
  ];
  for (const source of sources) {
    try {
      const result = await source();
      if (result) return result;
    } catch {
      // 尝试下一个数据源
    }
  }
  return null;
}

/** 默认天气（数据源全部不可用时） */
export function buildDefaultWeather(city: string): WeatherData {
  return {
    condition: 'Unknown',
    conditionLabel: '未知',
    conditionIcon: '🌤️',
    temperature: 20,
    humidity: 50,
    windSpeed: 0,
    windDirection: '',
    windLevel: '无风',
    wind: '无风',
    city,
  };
}
