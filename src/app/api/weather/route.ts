import { NextRequest } from 'next/server';
import { apiSuccess, apiServerError, getErrorMessage } from '@/lib/api-utils';
import { fetchWeatherData, buildDefaultWeather } from '@/lib/weather-service';

// GET /api/weather?city=城市名
// 数据源：和风天气（配 QWEATHER_API_KEY 时）→ 中央气象台（国内免费）→ wttr.in（兜底）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') || '北京';

    const weather = await fetchWeatherData(city);

    if (!weather) {
      return apiSuccess({ ...buildDefaultWeather(city), isDefault: true });
    }

    return apiSuccess(weather);
  } catch (error: unknown) {
    return apiServerError(getErrorMessage(error, '获取天气信息失败'));
  }
}
