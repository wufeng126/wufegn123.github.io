// 零星材料分类字典（两级）——单一事实来源
// 一级分类 12 类（编码 01~12），二级子类来自历史台账聚类（材料分类清单-系统录入版）
// 冲突裁决（已与用户确认）：
//   1. 覆盖类（彩条布/篷布/地膜/无纺布/编织袋等）统一归 07 周转辅材，不进 05 劳保安全
//   2. 跑腿费/车费统一归 11 运费
//   3. PVC/线管归 02 电线电气（线管线槽），PPR/PE/水管归 03 水暖管件
//   4. 不设"待归位"暂存桶（管材/电气/测量由识别直接归正），兜底仅"笼统待补明细"+"未分类待确认"
//   5. 方木、模板（木方/胶合板/竹胶板/铝模等大宗板材）不属于零星材料——由单独供应商供应，
//      已从周转辅材拆出（原 07-02 子类移除，编号保留不再启用），关键词不参与识别
//   6. 脚手架/扣件/架管归 07 周转辅材（租赁耗材），爬架/吊篮/升降平台归 10-06
//   7. 09 大型机具与 10 小型工具同名设备按金额区分（清单规则：单条≥5000 元归大型机具），
//      关键词默认识别为小型工具，前端在金额≥5000 时提示改归大型机具

export const MISC_MATERIAL_CATEGORIES = [
  '五金电料',
  '电线电气',
  '水暖管件',
  '焊接耗材',
  '劳保安全',
  '油料化工',
  '周转辅材',
  '其他材料',
  '大型机具',
  '小型工具',
  '运费',
  '施工杂费',
] as const;

export type MiscMaterialCategory = (typeof MISC_MATERIAL_CATEGORIES)[number];

export const DEFAULT_MISC_CATEGORY: MiscMaterialCategory = '其他材料';

/** 一级分类值数组（兼容旧调用点的校验用途） */
export const MISC_CATEGORY_VALUES: readonly MiscMaterialCategory[] = MISC_MATERIAL_CATEGORIES;

/** 二级子类定义 */
export interface MiscMaterialSubcategory {
  code: string; // 如 '01-01'
  value: string; // 子类名称，如 '紧固件'
  keywords: string[];
}

/** 一级分类定义（含二级子类） */
export interface MiscMaterialCategoryDef {
  code: string; // 如 '01'
  value: MiscMaterialCategory;
  keywords: string[]; // 一级兜底关键词（命中但不细分子类）
  subcategories: MiscMaterialSubcategory[];
}

/** 识别结果 */
export interface MiscCategoryGuess {
  category: MiscMaterialCategory;
  /** 子类名称；无法细分子类时为 null */
  subcategory: string | null;
}

export const MISC_MATERIAL_CATEGORY_DEFS: MiscMaterialCategoryDef[] = [
  {
    code: '01',
    value: '五金电料',
    keywords: ['五金'],
    subcategories: [
      { code: '01-01', value: '绑扎丝', keywords: ['扎丝', '圈丝', '弹力丝', '废扎丝', '绑丝'] },
      { code: '01-02', value: '钉类', keywords: ['圆钉', '码钉', '水泥钉', '钢排钉', '炮钉', '铁钉', '钉子', '钢钉'] },
      { code: '01-03', value: '钢丝·绳·网', keywords: ['铁丝', '钢丝绳', '钢丝网', '铅网', '钢化网', '镀锌挂网', '电焊网', '轧带', '钢丝'] },
      { code: '01-04', value: '紧固件', keywords: ['螺母', '螺丝', '螺杆', '丝杆', '对拉丝', '拉杆', '山型卡', '三型卡', '步步紧', '锥体母', '膨胀丝', '膨胀螺栓', 'U形丝', '合页', '销子', '轴承', '保护帽', '铁片', '卡扣', '螺栓'] },
      { code: '01-05', value: '金属构件', keywords: ['止水钢板', '柱头钢板', '梅花支架', '滑动支座', '钢筋吊架', '钢板', '支架'] },
      { code: '01-06', value: '五金其他', keywords: ['小五金'] },
    ],
  },
  {
    code: '02',
    value: '电线电气',
    keywords: ['电工', '电气'],
    subcategories: [
      { code: '02-01', value: '电线电缆', keywords: ['电线', '电缆', '软电线', '灯线', '插板线', '双色线', 'BVR', '铜线'] },
      { code: '02-02', value: '线管线槽', keywords: ['PVC管', 'PVC', '线管', '线槽', '波纹管', '穿线管', '穿筋管'] },
      { code: '02-03', value: '配电箱柜', keywords: ['配电箱', '插板箱', '插座箱', '充电箱', '防爆电箱', '电箱'] },
      { code: '02-04', value: '开关插座', keywords: ['插头', '插座', '插板', '开关', '按钮', '连接器'] },
      { code: '02-05', value: '保护电器', keywords: ['空开', '漏电保护器', '漏保', '断路器', '交流接触器', '继电器', '时控开关', '电表', '变频器'] },
      { code: '02-06', value: '照明灯具', keywords: ['灯泡', '灯管', 'LED灯', '灯带', '灯头', '头灯', '充电灯', '塔吊灯', '节能灯', '灯具'] },
      { code: '02-07', value: '电池电瓶', keywords: ['电池', '电瓶', '充电器', '充电线'] },
      { code: '02-08', value: '绝缘胶带', keywords: ['电工胶布', '绝缘胶带', '黄胶带', '防水胶布', '高压胶带', '海绵胶带', '绝缘', '胶布'] },
      { code: '02-09', value: '电气其他', keywords: ['电缆挂钩', '绝缘挂钩'] },
    ],
  },
  {
    code: '03',
    value: '水暖管件',
    // 清单未设二级子类；管件关键词全挂一级（PPR/PE/水管 归此，PVC 线管归电气）
    keywords: [
      '水暖', 'PPR', 'PE管', '水管', '管件', '弯头', '三通', '直接', '大小头', '球阀', '截止阀',
      '阀门', '水龙头', '生料带', '管卡', '堵头', '内丝', '外丝', '活接', '堵漏王',
    ],
    subcategories: [],
  },
  {
    code: '04',
    value: '焊接耗材',
    keywords: ['焊条', '焊丝', '焊把', '割枪', '切割片', '切片', '磨片', '砂轮片', '焊接', '焊机配件', '磨光机刀片'],
    subcategories: [],
  },
  {
    code: '05',
    value: '劳保安全',
    keywords: ['劳保'],
    subcategories: [
      { code: '05-01', value: '头部防护', keywords: ['安全帽', '帽贴'] },
      { code: '05-02', value: '坠落防护', keywords: ['安全带', '安全网', '密目网', '兜网', '安全绳', '缓冲器'] },
      { code: '05-03', value: '防护服装', keywords: ['马甲', '反光背心', '反光衣', '雨衣', '雨鞋', '水鞋', '劳保鞋', '绑腿', '手套', '口罩', '工作服'] },
      { code: '05-04', value: '消防器材', keywords: ['灭火器', '消防', '防火布'] },
      { code: '05-05', value: '安全标识', keywords: ['布标', '警示带', '警示线', '标识牌', '护栏', '道口条', '围挡', '警戒', '警示'] },
      { code: '05-06', value: '文明施工', keywords: ['垃圾袋', '垃圾桶', '藿香正气', '保温钉'] },
      { code: '05-07', value: '劳保其他', keywords: ['劳保用品'] },
    ],
  },
  {
    code: '06',
    value: '油料化工',
    keywords: ['化工'],
    subcategories: [
      { code: '06-01', value: '燃油费', keywords: ['加油费', '柴油', '汽油', '加油'] },
      { code: '06-02', value: '界面剂', keywords: ['界面剂'] },
      { code: '06-03', value: '脱模养护', keywords: ['脱模剂', '模板油', '铝模油', '养护剂'] },
      { code: '06-04', value: '稀料溶剂', keywords: ['稀料', '稀释剂', '松香水', '香蕉水'] },
      { code: '06-05', value: '胶粘剂', keywords: ['胶水', '万能胶', '108胶', '901胶', '植筋胶', '结构胶', '云石胶', '密封胶', '发泡剂', '发泡胶'] },
      { code: '06-06', value: '防水材料', keywords: ['防水涂料', '防水砂浆', '聚氨酯', '丙纶', 'SBS', '沥青', '防水'] },
      { code: '06-07', value: '腻子砂浆', keywords: ['腻子粉', '腻子', '抗裂砂浆', '干拌砂浆', '灌浆料', '砂浆'] },
      { code: '06-08', value: '油脂润滑油', keywords: ['机油', '液压油', '齿轮油', '黄油', '润滑油', '乳化油', '乳化液', '油桶'] },
      { code: '06-09', value: '油漆涂料', keywords: ['调和漆', '磁漆', '乳胶漆', '自喷漆', '防锈漆', '防腐漆', '外墙漆', '油漆', '涂料'] },
      { code: '06-10', value: '化工其他', keywords: ['美纹纸', '油漆刷', '纤维素', '皂化液'] },
    ],
  },
  {
    code: '07',
    value: '周转辅材',
    keywords: ['周转', '摊销'],
    subcategories: [
      { code: '07-01', value: '水泥垫块支撑', keywords: ['水泥垫块', '水泥支撑', '水泥条', '撑杆', '内撑', '垫块'] },
      // 07-02 方木与模板：已拆出（方木/模板类大宗板材属单独供应商供应，非零星材料），编号保留不启用
      { code: '07-03', value: '拉片与杆件', keywords: ['铝模拉片', '拉片', '周转外杆', '防水外杆', '铝膜管', '站立板', '斜斗', '对拉螺杆', '顶托'] },
      { code: '07-04', value: '网格与护角', keywords: ['网格布', '网格带', '阳角条', '护角', '阴阳角', '踢脚线'] },
      { code: '07-05', value: '薄膜与地膜', keywords: ['地膜', '薄膜', '农膜', '塑料布', '塑料套', '无纺布', '地板革', '棉毡', '养护膜'] },
      { code: '07-06', value: '篷布与苫盖', keywords: ['彩条布', '篷布', '棚布', '编织袋', '吨包袋'] },
      { code: '07-07', value: '封装辅材', keywords: ['双面胶', '打包带', '扎带', '打包扣'] },
      { code: '07-08', value: '周转其他', keywords: ['四氟板', '编压板', '挤塑板', '脚手架', '扣件', '十字扣件', '盘扣', '轮扣', '架管', '钢跳板', '跳板', '料斗', '套管'] },
    ],
  },
  {
    code: '08',
    value: '其他材料',
    keywords: ['其他'],
    subcategories: [
      { code: '08-01', value: '水泥建材', keywords: ['白水泥', '水泥', '修补材料', '沥青胶泥', '油膏', 'EPS线条', '聚乙烯'] },
      { code: '08-02', value: '办公与生活', keywords: ['办公', '文件柜', '沙发', '桌椅', '打印纸', '粉盒', '打印机', '施工日志', '毛巾'] },
      { code: '08-03', value: '税费规费', keywords: ['税费', '税钱'] },
      { code: '08-11', value: '标识印字', keywords: ['印字', '印泥', '标识贴', 'LOGO'] },
      { code: '08-12', value: '临设与板房', keywords: ['活动板房', '板房', '一次性模板', 'K板', '加热桶'] },
      { code: '08-13', value: '五金杂件', keywords: ['鸡心环', '万向轮', '套筒', '挂钩', '骑马卡', '锥形管', '自攻丝', '梯子', '滚筒刷'] },
      { code: '08-14', value: '笼统待补明细', keywords: ['零星材料', '材料费', '自购材料', '四方材料', '辅材'] },
      // 08-15 未分类待确认：无关键词，guessMiscCategory 全不匹配时的兜底（subcategory=null）
    ],
  },
  {
    code: '09',
    value: '大型机具',
    keywords: ['挖机', '挖掘机', '装载机', '铲车', '吊车', '塔吊', '起重机', '压路机', '叉车', '泵车', '罐车', '发电机', '空压机', '施工电梯', '升降机', '车辆', '台班', '机械租赁', '机械'],
    subcategories: [],
  },
  {
    code: '10',
    value: '小型工具',
    keywords: ['工具'],
    subcategories: [
      { code: '10-01', value: '钢筋机械', keywords: ['调直机', '弯曲机', '弯箍机', '握箍机', '切断机', '套丝机', '滚丝机', '锯床', '钢筋炮台'] },
      { code: '10-02', value: '混凝土机具', keywords: ['振动棒', '振动机', '抹光机', '布料机', '刮杠', '刮尺', '真平机'] },
      { code: '10-03', value: '焊接设备', keywords: ['电焊机', '焊机', '焊烟机', '焊线'] },
      { code: '10-04', value: '水泵与空压', keywords: ['污水泵', '自吸泵', '水泵', '气泵', '地泵', '泵管', '泵卡'] },
      { code: '10-05', value: '测量仪器', keywords: ['水准仪', '经纬仪', '全站仪', '卷尺', '钢尺', '靠尺', '水平尺', '墨斗', '施工线', '塔尺', '五线仪', '三脚架', '红外线', '万用表'] },
      { code: '10-06', value: '脚手架与平台', keywords: ['半架', '架子床', '爬架', '操作平台', '吊篮', '升降平台'] },
      { code: '10-07', value: '通讯与电器', keywords: ['对讲机', '喊话器', '喇叭', '空调', '取暖器', '净水器'] },
      { code: '10-08', value: '仓储与临设', keywords: ['货架', '料架', '台板', '案子'] },
      { code: '10-09', value: '运输与吊装', keywords: ['手推车', '斗车', '平板车', '三轮车', '地牛', '料台', '吊链', '拉马', '紧绳器', '千斤顶', '吊带', '轮胎', '翻斗车'] },
      { code: '10-10', value: '机具配件耗材', keywords: ['钻头', '批头', '锯条', '锯片', '簪子', '碳刷', '滚丝轮', '开孔器', '刀片', '轮子', '皮带', '电机', '控制器'] },
      { code: '10-11', value: '电动工具', keywords: ['电锤', '电镐', '电钻', '角磨机', '磨光机', '切割机', '电锯', '云石机', '切缝机', '切砖机', '吹风机', '喷雾器', '射钉枪', '炮钉枪'] },
      { code: '10-12', value: '手工工具', keywords: ['扳手', '钳子', '锤子', '铁锨', '铁锹', '洋镐', '十字镐', '耙子', '钢钎', '撬棍', '管钳', '钢锯', '螺丝刀', '剪刀'] },
      { code: '10-13', value: '清扫与容器', keywords: ['扫把', '扫帚', '簸箕', '笤帚', '灰桶', '灰盒', '水桶', '水盘', '泥桶', '灰斗车', '水箱', '灰槽'] },
      { code: '10-14', value: '机具其他', keywords: ['机具'] },
    ],
  },
  {
    code: '11',
    value: '运费',
    keywords: ['运费'],
    subcategories: [
      { code: '11-01', value: '装卸叉车费', keywords: ['叉车费', '装车费', '卸车费', '码费', '装卸费', '搬运费'] },
      { code: '11-02', value: '机械运输', keywords: ['机械运费', '吊车费', '随车吊', '吊泵车', '转场'] },
      { code: '11-03', value: '物流快递', keywords: ['物流费', '货拉拉', '跑腿费', '物流', '快递'] },
      { code: '11-04', value: '材料运输', keywords: ['材料运费', '拉货', '退料运费', '返库运费', '调拨', '运输费', '拉运费', '转运费', '倒运费'] },
      { code: '11-05', value: '运费其他', keywords: ['货运费', '车费'] },
    ],
  },
  {
    code: '12',
    value: '施工杂费',
    keywords: ['打扫', '清理', '垃圾清运', '保洁', '冲洗', '抽水', '排水', '临建', '场地平整', '杂工', '零工', '打杂', '清渣', '清灰', '维修', '保养', '租赁', '加工费', '检测费', '餐费', '安装费', '报告费', '检测'],
    subcategories: [],
  },
];

/** 一级分类 → 二级子类列表 */
export const MISC_MATERIAL_SUBCATEGORY_MAP: Record<MiscMaterialCategory, MiscMaterialSubcategory[]> =
  Object.fromEntries(
    MISC_MATERIAL_CATEGORY_DEFS.map((d) => [d.value, d.subcategories]),
  ) as Record<MiscMaterialCategory, MiscMaterialSubcategory[]>;

/** 全部二级子类扁平列表（含所属一级） */
export const MISC_MATERIAL_ALL_SUBCATEGORIES: Array<MiscMaterialSubcategory & { category: MiscMaterialCategory }> =
  MISC_MATERIAL_CATEGORY_DEFS.flatMap((d) =>
    d.subcategories.map((s) => ({ ...s, category: d.value })),
  );

/** 校验子类是否属于指定一级分类 */
export function isValidSubcategory(category: MiscMaterialCategory, subcategory: string): boolean {
  return (MISC_MATERIAL_SUBCATEGORY_MAP[category] || []).some((s) => s.value === subcategory);
}

/**
 * 根据材料名称智能推断分类（两级），最长关键词优先匹配
 * 匹配顺序：二级子类关键词（最长优先）→ 一级关键词（最长优先）→ 其他材料兜底
 */
export function guessMiscCategory(materialName: string): MiscCategoryGuess {
  if (!materialName) return { category: DEFAULT_MISC_CATEGORY, subcategory: null };
  const name = materialName.toLowerCase();

  // 1) 二级子类关键词（全局最长优先，保证跨类长词胜出）
  let bestSub: { category: MiscMaterialCategory; subcategory: string; len: number } | null = null;
  for (const def of MISC_MATERIAL_CATEGORY_DEFS) {
    for (const sub of def.subcategories) {
      for (const kw of sub.keywords) {
        if (name.includes(kw.toLowerCase()) && kw.length > (bestSub?.len ?? 0)) {
          bestSub = { category: def.value, subcategory: sub.value, len: kw.length };
        }
      }
    }
  }
  if (bestSub) return { category: bestSub.category, subcategory: bestSub.subcategory };

  // 2) 一级关键词（最长优先）
  let bestCat: { category: MiscMaterialCategory; len: number } | null = null;
  for (const def of MISC_MATERIAL_CATEGORY_DEFS) {
    for (const kw of def.keywords) {
      if (name.includes(kw.toLowerCase()) && kw.length > (bestCat?.len ?? 0)) {
        bestCat = { category: def.value, len: kw.length };
      }
    }
  }
  if (bestCat) return { category: bestCat.category, subcategory: null };

  // 3) 兜底：其他材料（子类留空 = 未分类待确认）
  return { category: DEFAULT_MISC_CATEGORY, subcategory: null };
}

/**
 * 清单规则辅助：单条金额≥5000 元的小型工具类材料，建议改归大型机具
 */
export const LARGE_MACHINERY_AMOUNT_THRESHOLD = 5000;
export function shouldSuggestLargeMachinery(category: MiscMaterialCategory, amount: number): boolean {
  return category === '小型工具' && amount >= LARGE_MACHINERY_AMOUNT_THRESHOLD;
}
