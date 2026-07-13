export type KnowledgeQualityLabel = '原始记录' | '已整理' | '推荐复用' | '标准经验';

export const KNOWLEDGE_BUSINESS_CATEGORIES = [
  '项目经验',
  '成本经验',
  '签证变更',
  '施工管理',
  '合同结算',
  '标准资料',
  '投标策略',
] as const;

export const KNOWLEDGE_CATEGORY_FILTERS = ['全部', ...KNOWLEDGE_BUSINESS_CATEGORIES] as const;

export const KNOWLEDGE_QUALITY_LEVELS: KnowledgeQualityLabel[] = [
  '原始记录',
  '已整理',
  '推荐复用',
  '标准经验',
];

export const KNOWLEDGE_QUALITY_TAG_PREFIX = '知识等级:';

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  business_data: '项目经验',
  law: '标准资料',
  company_policy: '施工管理',
  contract_template: '合同结算',
  field_glossary: '成本经验',
  项目档案: '项目经验',
  经验总结: '项目经验',
  成本分析: '成本经验',
  工序单价: '成本经验',
  签证: '签证变更',
  签证管理: '签证变更',
  合同模板: '合同结算',
  定额参考: '标准资料',
};

export function normalizeKnowledgeTags(tags?: string[] | string | null): string[] {
  if (Array.isArray(tags)) return tags.filter(Boolean).map(String);
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
  }
  return [];
}

export function getKnowledgeCategoryLabel(category?: string | null, tags: string[] = []): string {
  if (tags.some(tag => tag === '施工日志风险' || tag.startsWith('风险类型:'))) return '施工管理';
  if (tags.some(tag => tag.includes('签证') || tag.includes('变更'))) return '签证变更';
  if (tags.some(tag => tag.includes('合同') || tag.includes('结算'))) return '合同结算';
  if (tags.some(tag => tag.includes('单价') || tag.includes('成本'))) return '成本经验';

  const rawCategory = category || '';
  return LEGACY_CATEGORY_MAP[rawCategory] || rawCategory || '项目经验';
}

export function getKnowledgeQuality(tags: string[] = [], sourceType?: string | null, category?: string | null): KnowledgeQualityLabel {
  const qualityTag = tags.find(tag => tag.startsWith(KNOWLEDGE_QUALITY_TAG_PREFIX));
  const quality = qualityTag?.replace(KNOWLEDGE_QUALITY_TAG_PREFIX, '') as KnowledgeQualityLabel | undefined;
  if (quality && KNOWLEDGE_QUALITY_LEVELS.includes(quality)) return quality;

  if (tags.includes('标准经验') || getKnowledgeCategoryLabel(category, tags) === '标准资料') return '标准经验';
  if (tags.includes('推荐复用') || tags.includes('月度分析')) return '推荐复用';
  if (sourceType === 'manual' || sourceType === 'upload') return '已整理';
  return '原始记录';
}

export function upsertKnowledgeQualityTag(tags: string[], quality: KnowledgeQualityLabel): string[] {
  const cleanTags = tags.filter(tag => !tag.startsWith(KNOWLEDGE_QUALITY_TAG_PREFIX));
  return [...cleanTags, `${KNOWLEDGE_QUALITY_TAG_PREFIX}${quality}`];
}

export function getKnowledgeSourceLabel(sourceType?: string | null, sourceRef?: string | null, tags: string[] = []): string {
  const ref = sourceRef || '';
  if (tags.includes('月度分析') || ref.startsWith('monthly:')) return '月度分析';
  if (tags.includes('施工日志风险') || ref.startsWith('cl:')) return '施工日志';
  if (ref.startsWith('project:')) return '项目关联';
  if (sourceType === 'manual') return '手动录入';
  if (sourceType === 'upload') return '上传文件';
  if (sourceType === 'business_data') return '业务数据同步';
  if (sourceType === 'sync') return '系统同步';
  return '知识库';
}

export function getKnowledgeProjectName(sourceRef?: string | null, tags: string[] = []): string {
  const ref = sourceRef || '';
  if (ref.startsWith('project:')) {
    const [, , ...nameParts] = ref.split(':');
    return nameParts.join(':') || '';
  }
  const projectTag = tags.find(tag => tag.startsWith('项目:'));
  return projectTag?.replace('项目:', '') || '';
}

export function getKnowledgeScenarioTags(category: string, tags: string[] = []): string[] {
  const scenarios = tags
    .filter(tag => tag.startsWith('风险类型:') || tag.startsWith('月份:') || tag.startsWith('项目:'))
    .map(tag => tag.replace(/^风险类型:/, '风险：').replace(/^月份:/, '月份：').replace(/^项目:/, '项目：'));

  return Array.from(new Set([category, ...scenarios])).slice(0, 6);
}
