import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWindLevel, buildDefaultWeather, fetchWeatherData } from '@/lib/weather-service';

describe('weather-service 纯函数', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QWEATHER_API_KEY;
  });

  it('getWindLevel 边界：0 风速 → 无风', () => {
    expect(getWindLevel(0)).toBe('无风');
  });

  it('getWindLevel 大风速上限不越界', () => {
    expect(getWindLevel(200)).toBe('飓风');
    expect(getWindLevel(500)).toBe('飓风');
  });

  it('buildDefaultWeather 返回完整结构', () => {
    const d = buildDefaultWeather('北京');
    expect(d.city).toBe('北京');
    expect(d.condition).toBe('Unknown');
    expect(d.wind).toBe('无风');
    expect(typeof d.temperature).toBe('number');
  });

  it('数据源降级：和风未配 Key → 中国天气网成功返回', async () => {
    delete process.env.QWEATHER_API_KEY;
    const cmaResponse = 'var dataSK={"cityname":"北京","temp":"29.4","WD":"南风","WS":"2级","wse":"6km/h","SD":"57%","weather":"阴"};';
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('weather.com.cn')) {
        return { ok: true, status: 200, text: async () => cmaResponse } as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const weather = await fetchWeatherData('北京');
    expect(weather).not.toBeNull();
    expect(weather?.city).toBe('北京');
    expect(weather?.conditionLabel).toBe('阴');
    expect(weather?.wind).toContain('2级');
    expect(weather?.temperature).toBe(29);
    // 和风未配置时不会请求 qweather
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('qweather'))).toBe(false);
  });

  it('数据源降级：中国天气网失败 → wttr 兜底', async () => {
    delete process.env.QWEATHER_API_KEY;
    const wttrResponse = JSON.stringify({
      current_condition: [{ temp_C: '22', humidity: '60', windspeedKmph: '10', weatherDesc: [{ value: '多云' }] }],
      nearest_area: [{ areaName: [{ value: '上海' }] }],
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('weather.com.cn')) {
        return { ok: false, status: 500, text: async () => '' } as Response;
      }
      if (u.includes('wttr.in')) {
        return { ok: true, status: 200, json: async () => JSON.parse(wttrResponse) } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const weather = await fetchWeatherData('上海');
    expect(weather).not.toBeNull();
    expect(weather?.conditionLabel).toBe('多云');
    expect(weather?.temperature).toBe(22);
  });

  it('数据源全部失败 → null（由调用方返回默认值）', async () => {
    delete process.env.QWEATHER_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }) as Response));
    const weather = await fetchWeatherData('不存在城市xyz');
    expect(weather).toBeNull();
  });

  it('配置和风 Key 时优先请求和风', async () => {
    process.env.QWEATHER_API_KEY = 'test-key';
    const qwResponse = JSON.stringify({ code: '200', now: { temp: '26', humidity: '55', windSpeed: '8', windDir: '东风', windScale: '2', text: '晴' } });
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('qweather.com')) {
        return { ok: true, status: 200, json: async () => JSON.parse(qwResponse) } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const weather = await fetchWeatherData('深圳');
    expect(weather).not.toBeNull();
    expect(weather?.conditionLabel).toBe('晴');
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('qweather'))).toBe(true);
  });
});
