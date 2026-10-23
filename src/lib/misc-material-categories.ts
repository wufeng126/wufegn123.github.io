/**
 * 零星材料分类字典（建筑企业小额辅料）
 * 分类字典集中维护，录入表单/筛选/统计/导入导出均以此为准
 */

export const MISC_MATERIAL_CATEGORIES = [
  { value: '五金电料', keywords: ['铁丝', '扎丝', '铁钉', '螺丝', '螺栓', '螺母', '垫片', '合页', '门锁', '胶带', '膨胀', '铆钉', '钢丝', '钢钉', '卡子', '卡扣', '挂钩'] },
  { value: '电线电气', keywords: ['电线', '电缆', '穿线管', '线盒', '开关', '插座', '灯泡', '灯头', '灯座', '配电', '漏保', '空开', '线管', '绝缘', '电胶布', '电工', 'led', '灯管'] },
  { value: '水暖管件', keywords: ['pvc', 'ppr', 'pe管', '水管', '管件', '弯头', '三通', '直接', '阀门', '水龙头', '生料带', '接头', '法兰', '软管', '地漏', '堵头', '补芯', '管卡', '下水'] },
  { value: '焊接耗材', keywords: ['焊条', '焊丝', '切割片', '磨光片', '氧气', '乙炔', '氩气', '保护嘴', '导电嘴', '焊枪', '割枪', '碳棒'] },
  { value: '工具器具', keywords: ['工具', '电钻', '电锤', '角磨机', '扳手', '锤子', '钳子', '螺丝刀', '铁锹', '洋镐', '灰桶', '水桶', '卷尺', '靠尺', '水平尺', '钻头', '锯片', '刀片', '振动棒', '抹子', '灰刀', '扫帚', '推车', '翻斗', '斗车'] },
  { value: '劳保安全', keywords: ['安全帽', '安全带', '手套', '工服', '工作服', '绝缘鞋', '胶鞋', '雨鞋', '护目镜', '口罩', '雨衣', '雨靴', '反光', '防护服', '耳塞', '毛巾', '劳保', '防滑鞋', '安全网', '密目网', '警示带', '标识', '标牌', '围挡', '灭火器', '消防', '反光锥', '路锥', '彩旗', '标语', '警戒', '应急灯'] },
  { value: '油料化工', keywords: ['机油', '润滑油', '黄油', '脱模剂', '油漆', '稀料', '密封胶', '发泡胶', '玻璃胶', '柴油', '汽油', '液压油', '齿轮油', '涂料', '防腐', '胶水', '粘合剂', '环氧树脂'] },
  { value: '运费', keywords: ['运费', '运输费', '拉运费', '转运费', '倒运费', '货运费', '物流费', '装卸费', '搬运费', '车费', '运费补贴', '送货运费'] },
  { value: '其他材料', keywords: [] },
] as const;

export type MiscMaterialCategory = (typeof MISC_MATERIAL_CATEGORIES)[number]['value'];

export const DEFAULT_MISC_CATEGORY: MiscMaterialCategory = '其他材料';

export const MISC_CATEGORY_VALUES: string[] = MISC_MATERIAL_CATEGORIES.map((c) => c.value);

/** 根据材料名称启发式匹配分类，无法识别返回"其他材料"（不区分大小写） */
export function guessMiscCategory(materialName: string | null | undefined): MiscMaterialCategory {
  if (!materialName) return DEFAULT_MISC_CATEGORY;
  const name = materialName.toLowerCase();
  let best: MiscMaterialCategory = DEFAULT_MISC_CATEGORY;
  let bestLen = 0;
  for (const cat of MISC_MATERIAL_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (name.includes(kw.toLowerCase()) && kw.length > bestLen) {
        best = cat.value;
        bestLen = kw.length;
      }
    }
  }
  return best;
}
