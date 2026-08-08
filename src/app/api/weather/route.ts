import { NextRequest } from 'next/server';
import { apiSuccess, apiServerError, getErrorMessage } from '@/lib/api-utils';

// 天气状况映射
const WEATHER_CONDITION_MAP: Record<string, { label: string; icon: string }> = {
  'Clear': { label: '晴', icon: '☀️' },
  'Clouds': { label: '多云', icon: '⛅' },
  'Rain': { label: '雨', icon: '🌧️' },
  'Drizzle': { label: '小雨', icon: '🌦️' },
  'Thunderstorm': { label: '雷暴', icon: '⛈️' },
  'Snow': { label: '雪', icon: '🌨️' },
  'Mist': { label: '薄雾', icon: '🌫️' },
  'Fog': { label: '雾', icon: '🌫️' },
  'Haze': { label: '霾', icon: '😶‍🌫️' },
};

// 风力等级映射
function getWindLevel(speed: number): string {
  if (speed < 1) return '无风';
  if (speed < 6) return '软风';
  if (speed < 12) return '轻风';
  if (speed < 20) return '微风';
  if (speed < 29) return '和风';
  if (speed < 39) return '清风';
  if (speed < 50) return '强风';
  if (speed < 62) return '疾风';
  if (speed < 75) return '大风';
  if (speed < 89) return '烈风';
  if (speed < 103) return '狂风';
  if (speed < 117) return '暴风';
  return '飓风';
}

type WeatherData = {
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

// 使用 wttr.in 免费天气服务
async function fetchWeatherFromWttr(city: string): Promise<WeatherData | null> {
  try {
    const response = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      {
        headers: {
          'User-Agent': 'ConstructionLog/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const current = data?.current_condition?.[0];
    if (!current) return null;

    const weatherCode = current.weatherCode || current.weatherDesc?.[0]?.value || '';
    const condition = mapWeatherCode(weatherCode);
    const conditionInfo = WEATHER_CONDITION_MAP[condition] || { label: condition, icon: '🌤️' };
    const windSpeed = parseFloat(current.windspeedKmph) || 0;
    const windDirection = current.winddir16Point || '';
    const windLevel = getWindLevel(windSpeed);

    return {
      condition,
      conditionLabel: conditionInfo.label,
      conditionIcon: conditionInfo.icon,
      temperature: parseFloat(current.temp_C) || 0,
      humidity: parseInt(current.humidity) || 0,
      windSpeed,
      windDirection,
      windLevel,
      wind: [windLevel, windDirection].filter(Boolean).join(' ') || '无风',
      city: data?.nearest_area?.[0]?.areaName?.[0]?.value || city,
    };
  } catch {
    return null;
  }
}

// 天气代码映射
function mapWeatherCode(code: string): string {
  const numCode = parseInt(code);
  if (numCode >= 113 && numCode <= 116) return 'Clear';
  if (numCode >= 119 && numCode <= 122) return 'Clouds';
  if (numCode >= 143 && numCode <= 146) return 'Mist';
  if (numCode >= 176 && numCode <= 182) return 'Rain';
  if (numCode >= 227 && numCode <= 232) return 'Snow';
  if (numCode >= 248 && numCode <= 266) return 'Rain';
  if (numCode >= 263 && numCode <= 266) return 'Drizzle';
  if (numCode >= 281 && numCode <= 284) return 'Drizzle';
  if (numCode >= 293 && numCode <= 314) return 'Rain';
  if (numCode >= 317 && numCode <= 338) return 'Snow';
  if (numCode >= 350 && numCode <= 359) return 'Rain';
  if (numCode >= 362 && numCode <= 368) return 'Snow';
  if (numCode >= 371 && numCode <= 395) return 'Snow';
  return 'Clear';
}

// GET /api/weather?city=城市名
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || '北京';

    const weather = await fetchWeatherFromWttr(city);

    if (!weather) {
      // 返回默认值
      return apiSuccess({
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
        isDefault: true,
      });
    }

    return apiSuccess(weather);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '获取天气信息失败'));
  }
}
