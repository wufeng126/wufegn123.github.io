import { OSSStorage } from '@/lib/oss-storage';
import { getAIConfig, createConfiguredLLMClient } from '@/lib/ai-service';

export interface ParsedReceiptItem {
  recipientName: string;
  bankAccount: string;
  bankCardTail: string;
  amount: number;
  status: string;
  bankName: string;
}

export interface ParsedBankReceipt {
  header: {
    totalAmount: number | null;
    itemCount: number | null;
    paymentDate: string | null;
    purpose: string | null;
    payerAccount: string | null;
    payerName: string | null;
  };
  items: ParsedReceiptItem[];
  failedItems: ParsedReceiptItem[];
  source: 'ai' | 'rule' | 'multimodal';
  warnings: string[];
}

export interface ReceiptParseValidation {
  amountMatched: boolean;
  amountDiff: number;
  itemCountMatched: boolean;
  itemCountDiff: number;
}

const AI_TIMEOUT_MS = 60_000;
const MONEY_TOLERANCE = 0.01;

function sanitizeText(value: unknown, max = 200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 解析金额文本：支持 1,000.00 / 1000 / 41,000.00 */
export function parseReceiptMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/[,，¥￥\s]/g, '');
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

/** 从 yyyyMMdd 或可解析日期文本中取 yyyy-MM-dd */
function normalizeDate(value: unknown): string | null {
  const text = sanitizeText(value, 40);
  if (!text) return null;
  const compact = text.match(/(20\d{2})[-/.年]?(\d{1,2})[-/.月]?(\d{1,2})/);
  if (compact) {
    const [, y, m, d] = compact;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** 提取回单抬头信息（规则解析，兼容 OCR 文本中的冒号/空格变体） */
function parseHeader(lines: string[]): ParsedBankReceipt['header'] {
  const header: ParsedBankReceipt['header'] = {
    totalAmount: null,
    itemCount: null,
    paymentDate: null,
    purpose: null,
    payerAccount: null,
    payerName: null,
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const fieldMatch = (labels: string[]) => {
      for (const label of labels) {
        const re = new RegExp(`${label}\\s*[:：]?\\s*(.+)$`);
        const matched = line.match(re);
        if (matched) return matched[1].trim();
      }
      return null;
    };

    if (/总金额|合计金额|金额合计/.test(line)) {
      header.totalAmount ??= parseReceiptMoney(fieldMatch(['总金额', '合计金额', '金额合计']) ?? line);
    }
    if (/笔数|总笔数|交易笔数/.test(line)) {
      const value = fieldMatch(['笔数', '总笔数', '交易笔数']);
      if (value) {
        const count = Number(value.match(/\d+/)?.[0] ?? '');
        if (Number.isInteger(count) && count > 0) header.itemCount ??= count;
      }
    }
    if (/期望日期|经办日期|交易日期|付款日期|记账日期/.test(line) && !header.paymentDate) {
      header.paymentDate = normalizeDate(fieldMatch(['期望日期', '经办日期', '交易日期', '付款日期', '记账日期']) ?? line);
    }
    if (/用途|摘要|客户备注|附言/.test(line) && !header.purpose) {
      const value = fieldMatch(['用途', '摘要', '客户备注', '附言']);
      if (value && value && !/^[:：]?\s*$/.test(value)) header.purpose = sanitizeText(value, 100);
    }
    if (/^账号[:：]/.test(line) && !header.payerAccount) {
      const value = fieldMatch(['账号']);
      const accountMatch = value?.match(/\d{6,}/);
      if (accountMatch) header.payerAccount = accountMatch[0];
      const nameMatch = value?.split(/[,，]/).map(part => part.trim()).find(part => /公司|劳务|工程/.test(part));
      if (nameMatch && !header.payerName) header.payerName = sanitizeText(nameMatch, 100);
    }
  }

  return header;
}

const NON_DETAIL_KEYWORDS = /(网上代发代扣业务明细|代发代扣业务明细|打印时间|业务参考号|处理状态|记账方式|记账子单元|用户所属|https?:\/\/|\.aspx)/;
const TABLE_HEADER_LINE = /^(账号|卡号|收款账号)\s.*(户名|收款人)\s.*金额/;
const HEADER_LABEL_LINE = /^(类型|期望日期|经办日|经办日期|账号|笔数|总金额|用途|客户备注|付款方|收款方|打印时间|业务参考号|记账方式|处理状态|用户所属)[：:]/;

/** 规则解析明细行：长串卡号 + 姓名 + 金额 + 成功/失败状态 */
function parseDetailLine(line: string): ParsedReceiptItem | null {
  const normalized = line.replace(/[ \t]+/g, ' ').trim();
  if (!normalized || NON_DETAIL_KEYWORDS.test(normalized)) return null;
  if (TABLE_HEADER_LINE.test(normalized) || HEADER_LABEL_LINE.test(normalized)) return null;
  // 银行名单独成行（如"招商银行 CHINA MERCHANTS BANK"）直接跳过
  if (!/\d/.test(normalized)) return null;

  const accountMatch = normalized.match(/\b(\d[\d\s]{10,28}\d)\b/);
  if (!accountMatch) return null;
  const account = accountMatch[1].replace(/\s/g, '');
  if (account.length < 12) return null;

  const afterAccount = normalized.slice(accountMatch.index! + accountMatch[0].length).trim();
  const beforeAccount = normalized.slice(0, accountMatch.index).trim();

  // 金额：账号后的第一个金额数字（千分位 41,000.00 或普通 1000.00 均可）
  const amountMatch = afterAccount.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/);
  if (!amountMatch || amountMatch.index === undefined) return null;
  const amount = parseReceiptMoney(amountMatch[0]);
  if (amount === null || amount <= 0) return null;

  // 户名优先取账号前的文字，其次取账号与金额之间的片段
  let name = beforeAccount;
  if (!name || /\d/.test(name)) {
    name = afterAccount.slice(0, amountMatch.index).trim();
  }
  name = name.replace(/[|｜:：]/g, '').trim();
  // 户名通常为 2~8 个汉字
  const nameMatch = name.match(/[\u4e00-\u9fa5·•]{2,8}/);
  if (!nameMatch) return null;
  const recipientName = nameMatch[0];

  const statusText = afterAccount.slice(amountMatch.index + amountMatch[0].length);
  const isFailed = /失败|退回|异常|未成功/.test(statusText);
  const status = isFailed ? '失败' : (/成功/.test(statusText) ? '成功' : '成功');

  const bankNameMatch = statusText.match(/(中国工商银行|中国建设银行|中国农业银行|中国银行|交通银行|招商银行|中国邮政储蓄银行|农村商业银行|农村信用社|中信银行|兴业银行|光大银行|民生银行|浦发银行|平安银行|华夏银行)/);

  return {
    recipientName,
    bankAccount: account,
    bankCardTail: account.slice(-4),
    amount,
    status,
    bankName: bankNameMatch ? bankNameMatch[0] : '',
  };
}

/** 纯规则解析整段回单文本 */
export function parseBankReceiptText(rawText: string): ParsedBankReceipt {
  const warnings: string[] = [];
  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const header = parseHeader(lines);
  const allItems = lines
    .map(parseDetailLine)
    .filter((item): item is ParsedReceiptItem => item !== null);

  // 同一卡号去重（多页回单可能出现重复行）
  const deduped = new Map<string, ParsedReceiptItem>();
  for (const item of allItems) {
    const key = `${item.bankAccount}|${item.amount}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const uniqueItems = Array.from(deduped.values());
  const items = uniqueItems.filter(item => item.status === '成功');
  const failedItems = uniqueItems.filter(item => item.status !== '成功');
  if (failedItems.length > 0) warnings.push(`检测到 ${failedItems.length} 笔非成功状态明细，已自动排除`);

  if (items.length === 0) warnings.push('规则解析未识别到任何成功明细');
  return { header, items, failedItems, source: 'rule', warnings };
}

/** 从 LLM 输出中提取 JSON（兼容 ```json 包裹与前后噪声） */
function extractJsonBlock(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const objectStart = body.indexOf('{');
  const objectEnd = body.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(body.slice(objectStart, objectEnd + 1));
    } catch {
      // fall through
    }
  }
  const arrayStart = body.indexOf('[');
  const arrayEnd = body.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(body.slice(arrayStart, arrayEnd + 1));
    } catch {
      // fall through
    }
  }
  return null;
}

function normalizeAiItems(rawItems: unknown): ParsedReceiptItem[] {
  if (!Array.isArray(rawItems)) return [];
  const result: ParsedReceiptItem[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const recipientName = sanitizeText(row.recipientName ?? row.name ?? row.accountName ?? row.userName, 30);
    const account = sanitizeText(row.bankAccount ?? row.account ?? row.cardNo ?? row.bankCard ?? '', 32).replace(/\s/g, '');
    const amount = parseReceiptMoney(row.amount ?? row.money ?? row.payAmount);
    if (!recipientName || amount === null || amount <= 0) continue;
    const status = sanitizeText(row.status ?? '', 10) || '成功';
    result.push({
      recipientName,
      bankAccount: account,
      bankCardTail: account ? account.slice(-4) : sanitizeText(row.bankCardTail ?? row.tail ?? '', 6),
      amount,
      status: /失败|退回|异常/.test(status) ? '失败' : '成功',
      bankName: sanitizeText(row.bankName ?? row.openBank ?? '', 50),
    });
  }
  return result;
}

const AI_SYSTEM_PROMPT = `你是银行代发回单识别助手。用户会提供一张银行代发/转账回单的 OCR 全文（可能包含招商银行、工商银行等银行的"代发代扣业务明细"）。
请从文本中提取回单抬头与明细表格，严格输出 JSON，不要输出任何解释或 markdown：
{
  "header": {
    "totalAmount": number | null,   // 回单"总金额/合计金额"，单位元，去掉千分位
    "itemCount": number | null,    // 回单"笔数"
    "paymentDate": "yyyy-MM-dd" | null, // 期望日期/经办日期/交易日期
    "purpose": string | null,      // 用途/摘要/客户备注
    "payerAccount": string | null, // 付款方账号
    "payerName": string | null     // 付款户名/公司名
  },
  "items": [
    {
      "recipientName": string, // 户名（收款人姓名）
      "bankAccount": string,   // 完整账号/卡号（纯数字）
      "amount": number,        // 该笔金额，单位元
      "status": "成功" | "失败",
      "bankName": string       // 开户行，没有则空字符串
    }
  ]
}
要求：
1. 只提取表格中的真实明细行，不要把表头（账号/户名/金额/状态/注释/开户行）、页眉页脚、网址、页码当作明细。
2. 每一笔明细都必须有户名和金额；金额一律转为数字（如 1,000.00 → 1000）。
3. 状态不是"成功"（如失败、退回）的行也要放入 items，status 如实填写。
4. 账号是表格第一列的长串数字，通常 12~19 位；不要把业务参考号、日期当作账号。`;

/** 调用 LLM 将回单文本结构化为 JSON */
async function parseReceiptWithAI(forwardHeaders: Record<string, string>, ocrText: string): Promise<ParsedBankReceipt | null> {
  try {
    const config = await getAIConfig();
    const client = await createConfiguredLLMClient(forwardHeaders);
    if (!client || !config) return null;

    const task = (async (): Promise<string> => {
      const stream = await client.stream(
        [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: ocrText.slice(0, 12000) },
        ],
        { model: config.model_id, temperature: 0 },
      );
      let text = '';
      for await (const chunk of stream) {
        const part = chunk as { content?: unknown; text?: unknown } | string;
        if (typeof part === 'string') text += part;
        else if (typeof part?.content === 'string') text += part.content;
        else if (typeof part?.text === 'string') text += part.text;
      }
      return text;
    })();

    const text = await Promise.race([
      task,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('回单解析超时')), AI_TIMEOUT_MS)),
    ]).catch(() => '');
    if (!text) return null;

    const json = extractJsonBlock(text);
    if (!json || typeof json !== 'object') return null;
    const root = json as Record<string, unknown>;
    const rawHeader = (root.header && typeof root.header === 'object' ? root.header : {}) as Record<string, unknown>;
    const allItems = normalizeAiItems(root.items);
    if (allItems.length === 0) return null;

    const warnings: string[] = [];
    const items = allItems.filter(item => item.status === '成功');
    const failedItems = allItems.filter(item => item.status !== '成功');
    if (failedItems.length > 0) warnings.push(`检测到 ${failedItems.length} 笔非成功状态明细，已自动排除`);

    return {
      header: {
        totalAmount: parseReceiptMoney(rawHeader.totalAmount),
        itemCount: (() => {
          const count = Number(rawHeader.itemCount);
          return Number.isInteger(count) && count > 0 ? count : null;
        })(),
        paymentDate: normalizeDate(rawHeader.paymentDate),
        purpose: sanitizeText(rawHeader.purpose, 100) || null,
        payerAccount: sanitizeText(rawHeader.payerAccount, 32) || null,
        payerName: sanitizeText(rawHeader.payerName, 100) || null,
      },
      items,
      failedItems,
      source: 'ai',
      warnings,
    };
  } catch (error) {
    console.warn('[银行回单解析] AI 解析失败，将回退规则解析:', error);
    return null;
  }
}

/**
 * OCR 提取回单文件全文
 *
 * 通道选择：优先用多模态 LLM 视觉识别（与知识库扫描件 OCR 同一已验证通道），
 * 模型服务端直接拉取 OSS 签名 URL，不经过 FetchClient 的 HEAD 可达性校验
 * （OSS SigV4 签名 URL 只允许 GET，HEAD 会 403 导致 FetchClient 拒绝）。
 * 图片同时支持签名 URL 与 base64 data URI 两种传入方式（前者失败回退后者）。
 */
export async function extractReceiptOcrText(params: {
  fileKey: string;
  fileName: string;
  forwardHeaders: Record<string, string>;
}): Promise<string> {
  const storage = new OSSStorage();
  const signedUrl = await storage.generatePresignedUrl({ key: params.fileKey, expireTime: 900 });

  const config = await getAIConfig();
  if (!config?.enabled) {
    throw new Error('AI 未启用，无法识别回单图片');
  }
  const client = await createConfiguredLLMClient(params.forwardHeaders);
  if (!client) {
    throw new Error('AI 未配置密钥，无法识别回单图片');
  }

  const systemPrompt = [
    '你是银行代发工资回单 OCR 助手。请完整、逐行提取图片中的全部文字与数字，',
    '尤其要保留：标题（如代发代扣业务明细/回单）、记账日期、业务参考号、',
    '付款账号与户名、用途、交易总金额、交易总笔数、每一条明细的卡号/账号、',
    '收款人姓名、金额、交易状态（成功/失败/退回等）。',
    '要求：按原文顺序输出纯文本，明细尽量每行一条，数字（含千分位与小数点）',
    '必须与图片完全一致，不要解释、不要省略、不要臆造。',
  ].join('');

  const callVision = async (imageUrl: string): Promise<string> => {
    const stream = await client.stream([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张银行代发回单图片中的所有文字内容（含表头与全部明细行）：' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ], {
      model: config.model_id,
      temperature: 0,
    });

    let text = '';
    for await (const chunk of stream as AsyncIterable<unknown>) {
      const part = chunk as { content?: unknown; text?: unknown };
      if (typeof part === 'string') text += part;
      else if (typeof part?.content === 'string') text += part.content;
      else if (typeof part?.text === 'string') text += part.text;
      else if (part?.content && Array.isArray(part.content)) {
        text += (part.content as unknown[]).map((item) => {
          const record = item as { text?: unknown; content?: unknown };
          return String(record?.text || record?.content || '');
        }).join('');
      }
    }
    return text.trim();
  };

  // 优先：服务端 GET 下载转 base64 data URI。
  // OSS SigV4 签名 URL 对模型服务端/抓取代理的直连经常 403（HEAD 校验或区域拉取受限），
  // 而本服务用签名 URL 的 GET 下载稳定 200，故内联图片数据最可靠，也不依赖外链可达性。
  let dataUri: string | null = null;
  try {
    const fileResp = await fetch(signedUrl);
    if (fileResp.ok) {
      const mimeType = fileResp.headers.get('content-type') || guessMimeByFileName(params.fileName);
      const buffer = Buffer.from(await fileResp.arrayBuffer());
      dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
      const text = await callVision(dataUri);
      if (text) return text;
    }
  } catch (downloadError) {
    console.warn('[ReceiptOCR] data URI 视觉识别失败，回退签名 URL:', getFetchErrorMessage(downloadError));
  }

  // 回退：直接把签名 URL 交给模型服务端拉取
  const text = await callVision(signedUrl);
  if (text) return text;
  if (dataUri) return callVision(dataUri);
  return '';
}

function getFetchErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function guessMimeByFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

/**
 * 解析银行回单：OCR → AI 结构化（失败回退规则解析）
 */
export async function parseBankReceipt(params: {
  ocrText: string;
  forwardHeaders: Record<string, string>;
}): Promise<ParsedBankReceipt> {
  const { ocrText, forwardHeaders } = params;
  if (!ocrText.trim()) {
    return {
      header: { totalAmount: null, itemCount: null, paymentDate: null, purpose: null, payerAccount: null, payerName: null },
      items: [],
      failedItems: [],
      source: 'rule',
      warnings: ['未能从回单文件中识别出文字，请确认文件清晰后重试，或改用手工拆分'],
    };
  }

  const aiResult = await parseReceiptWithAI(forwardHeaders, ocrText);
  if (aiResult && aiResult.items.length > 0) return aiResult;

  const ruleResult = parseBankReceiptText(ocrText);
  if (aiResult === null && ruleResult.items.length === 0) {
    ruleResult.warnings.push('AI 解析未返回有效明细，已使用规则解析；请逐行核对识别结果');
  }
  return ruleResult;
}

/** 拆分结果与回单抬头对账 */
export function validateReceiptParse(parsed: ParsedBankReceipt): ReceiptParseValidation {
  const itemsTotal = Math.round(parsed.items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const amountDiff = parsed.header.totalAmount !== null
    ? Math.round((itemsTotal - parsed.header.totalAmount) * 100) / 100
    : 0;
  const itemCountDiff = parsed.header.itemCount !== null
    ? parsed.items.length - parsed.header.itemCount
    : 0;
  return {
    amountMatched: parsed.header.totalAmount === null || Math.abs(amountDiff) <= MONEY_TOLERANCE,
    amountDiff,
    itemCountMatched: parsed.header.itemCount === null || itemCountDiff === 0,
    itemCountDiff,
  };
}
