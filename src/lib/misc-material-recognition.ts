export interface MiscMaterialProjectOption {
  id: number;
  name: string;
}

export interface MiscMaterialDraft {
  project_id: string;
  project_name: string;
  material_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  purchase_date: string;
  supplier: string;
  remark: string;
  confidence: number;
  warnings: string[];
}

const UNIT_WORDS = [
  '个', '件', '包', '袋', '箱', '桶', '米', 'm', 'M', '㎡', 'm2', 'M2', '吨',
  'kg', 'KG', '公斤', '盒', '套', '张', '根', '卷', '车', '片', '块', '方',
  '立方', '瓶', '只', '支', '捆', '盘',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[，；。]/g, '\n')
    .replace(/[、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDateValue(text: string) {
  const full = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (full) {
    const [, y, m, d] = full;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const short = text.match(/(\d{1,2})月(\d{1,2})日?/);
  if (short) {
    const year = new Date().getFullYear();
    return `${year}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`;
  }

  return today();
}

function findProject(text: string, projects: MiscMaterialProjectOption[]) {
  const sortedProjects = [...projects].sort((a, b) => b.name.length - a.name.length);
  return sortedProjects.find(project => text.includes(project.name)) || null;
}

function numberFromMatch(match: RegExpMatchArray | null, index = 1) {
  if (!match?.[index]) return '';
  const value = Number(match[index].replace(/,/g, ''));
  return Number.isFinite(value) ? String(value) : '';
}

function extractQuantityAndUnit(text: string) {
  const unitPattern = UNIT_WORDS.map(unit => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})`));
  return {
    quantity: numberFromMatch(match, 1),
    unit: match?.[2] || '',
  };
}

function extractUnitPrice(text: string) {
  return numberFromMatch(
    text.match(/(?:单价|价格|每(?:个|件|包|袋|箱|桶|米|吨|公斤|盒|套|张|根|卷|车|片|块|方)?|元\/\S*)\s*[:：]?\s*(\d+(?:\.\d+)?)/),
  );
}

function extractAmount(text: string) {
  return numberFromMatch(text.match(/(?:合计|总价|共计|共|金额)\s*[:：]?\s*(\d+(?:\.\d+)?)/));
}

function extractSupplier(text: string) {
  const match = text.match(/(?:供应商|商家|采购人|采购自|购自|从)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()_\-]{2,30})/);
  return match?.[1] || '';
}

function cleanMaterialName(text: string, projectName: string, supplier: string) {
  let value = text;
  if (projectName) value = value.replace(projectName, '');
  if (supplier) value = value.replace(supplier, '');
  value = value
    .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, '')
    .replace(/\d{1,2}月\d{1,2}日?/g, '')
    .replace(/(?:供应商|商家|采购人|采购自|购自|从)\s*[:：]?/g, '')
    .replace(/(?:单价|价格|合计|总价|共计|共|金额|每\S*)\s*[:：]?\s*\d+(?:\.\d+)?/g, '')
    .replace(new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${UNIT_WORDS.join('|')})`, 'g'), '')
    .replace(/(项目|采购|购买|买了|买|材料|零星|辅材|元|￥|¥|，|,|:|：|\(|\)|（|）)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length > 24) value = value.slice(0, 24).trim();
  return value;
}

function splitMaterialLines(text: string) {
  const rawLines = text
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/【第\d+张】/g, '').trim())
    .filter(Boolean);

  if (rawLines.length > 1) return rawLines;
  return normalizeText(text).split(/(?:\s*[;；]\s*)/).map(line => line.trim()).filter(Boolean);
}

export function parseMiscMaterialText(
  rawText: string,
  projects: MiscMaterialProjectOption[] = [],
): { drafts: MiscMaterialDraft[]; warnings: string[] } {
  const text = rawText.trim();
  if (!text) {
    return { drafts: [], warnings: ['未识别到文字，请人工录入或重新拍摄更清晰的照片。'] };
  }

  const lines = splitMaterialLines(text).slice(0, 20);
  const drafts = lines.map(line => {
    const project = findProject(line, projects) || findProject(text, projects);
    const supplier = extractSupplier(line) || extractSupplier(text);
    const { quantity, unit } = extractQuantityAndUnit(line);
    const amount = extractAmount(line);
    let unitPrice = extractUnitPrice(line);
    if (!unitPrice && amount && quantity) {
      unitPrice = String(Math.round((Number(amount) / Number(quantity)) * 100) / 100);
    }

    const materialName = cleanMaterialName(line, project?.name || '', supplier);
    const warnings: string[] = [];
    if (!project) warnings.push('未匹配到项目，请手动选择。');
    if (!materialName) warnings.push('未识别到材料名称，请手动填写。');
    if (!quantity) warnings.push('未识别到数量，请手动填写。');
    if (!unitPrice) warnings.push('未识别到单价，请手动填写。');

    const filled = [project, materialName, quantity, unitPrice, unit, supplier].filter(Boolean).length;
    return {
      project_id: project ? String(project.id) : '',
      project_name: project?.name || '',
      material_name: materialName,
      unit,
      quantity,
      unit_price: unitPrice,
      purchase_date: toDateValue(line) || toDateValue(text),
      supplier,
      remark: `识别原文：${line}`.slice(0, 500),
      confidence: Math.min(0.95, Math.max(0.35, filled / 6)),
      warnings,
    };
  }).filter(draft => draft.material_name || draft.quantity || draft.unit_price);

  const warnings = drafts.flatMap(draft => draft.warnings);
  if (drafts.length === 0) warnings.push('未能提炼出有效材料记录，请人工录入。');

  return { drafts, warnings: [...new Set(warnings)] };
}
