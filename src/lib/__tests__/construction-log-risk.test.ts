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

  // ===== 降误报增强用例 =====

  it('否定表述不误报：无质量问题', () => {
    const risk = detectConstructionLogRisk({ content: '今日完成墙体砌筑，无质量问题', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('否定表述不误报：未发生安全事故', () => {
    const risk = detectConstructionLogRisk({ content: '今日施工正常，未发生安全事故', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('否定表述不误报：不存在安全隐患', () => {
    const risk = detectConstructionLogRisk({ content: '现场巡查，不存在安全隐患', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('闭环表述不误报：已整改完成', () => {
    const risk = detectConstructionLogRisk({ content: '昨日发现的裂缝问题已整改完成', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('中性管理语境不误报：安全检查', () => {
    const risk = detectConstructionLogRisk({ content: '今日进行例行安全检查，情况正常', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('中性管理语境不误报：质量例会', () => {
    const risk = detectConstructionLogRisk({ content: '下午召开质量例会，宣贯验收标准', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('中性管理语境不误报：成本分析', () => {
    const risk = detectConstructionLogRisk({ content: '财务进行本月成本分析，制作台账', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('弱词单独出现不误报：等待', () => {
    const risk = detectConstructionLogRisk({ content: '今日正常等待材料到场后施工', issues: '' });
    expect(risk.hasRisk).toBe(false);
  });

  it('强词仍触发：发现裂缝（真实风险）', () => {
    const risk = detectConstructionLogRisk({ content: '今日巡查发现墙体出现裂缝', issues: '' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.types).toContain('quality');
  });

  it('弱词+风险语境触发：出现质量问题', () => {
    const risk = detectConstructionLogRisk({ content: '混凝土浇筑出现质量问题，需返工处理', issues: '' });
    expect(risk.hasRisk).toBe(true);
    expect(risk.types).toContain('quality');
  });

  it('多弱词组合触发：进度滞后且等待材料', () => {
    const risk = detectConstructionLogRisk({ content: '工期紧张进度滞后，且等待材料到场', issues: '' });
    expect(risk.hasRisk).toBe(true);
  });
});
