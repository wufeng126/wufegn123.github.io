import { describe, it, expect } from 'vitest';
import { detectConstructionLogRisk } from '@/lib/construction-log-risk';

describe('construction-log-risk', () => {
  it('无内容无风险', () => {
    const risk = detectConstructionLogRisk({ content: '', issues: '' });
    expect(risk.hasRisk).toBe(false);
    expect(risk.types).toHaveLength(0);
  });

  it('命中安全关键词 → 高风险', () => {
    const risk = detectConstructionLogRisk({ content: '今日发生安全事故，一名工人受伤', issues: '' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.level).toBe('high');
    expect(risk.types).toContain('safety');
  });

  it('命中质量关键词 → 有风险', () => {
    const risk = detectConstructionLogRisk({ content: '混凝土浇筑出现质量问题，需返工', issues: '' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.types).toContain('quality');
  });

  it('普通内容不误报', () => {
    const risk = detectConstructionLogRisk({ content: '今日正常施工，完成 3 号楼二层顶板浇筑', issues: '无' });
    expect(risk.hasRisk).toBe(false);
  });

  it('issues 中同样检测风险（质量关键词"裂缝"）', () => {
    const risk = detectConstructionLogRisk({ content: '施工正常', issues: '发现基坑边坡裂缝' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.types).toContain('quality');
    expect(risk.level).toBe('medium'); // issues 有内容 → 中风险
  });

  it('多类风险合并并给出主要类型', () => {
    const risk = detectConstructionLogRisk({ content: '脚手架坍塌导致质量问题与安全事故', issues: '' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.types.length).toBeGreaterThanOrEqual(2);
    expect(risk.primaryType).toBeTruthy();
    expect(risk.summary).toContain('风险');
  });

  it('enrich 输出包含风险摘要字段', () => {
    const log = { content: '发现基坑边坡开裂', issues: '' };
    const enriched = detectConstructionLogRisk(log);
    expect(enriched.summary.length).toBeGreaterThan(0);
  });
});
