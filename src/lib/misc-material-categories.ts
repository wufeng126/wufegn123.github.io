// 零星材料分类字典（两级）——单一事实来源
// 一级分类 12 类（编码 01~12），二级子类依据《材料分类清单-系统录入版-V2.xlsx》
// 大类分组：A 消耗性材料（01~08）、B 机具设备（09~10）、C 费用（11~12）
// 识别规则（V2）：
//   1. 覆盖类（彩条布/篷布/地膜/无纺布/编织袋等）统一归 07 周转辅材，不进 05 劳保安全
//   2. PVC/线管归 02-02 线管线槽，PPR/PE/水管归 03 水暖管件
//   3. 兜底仅 08-03 笼统待补明细 + 08-04 未分类待确认（guess 全不匹配时 category=其他材料、subcategory=null）
//   4. 07-02 方木与模板按 V2 清单保留在零星材料分类内（清单历史台账含此类支出）
//   5. 脚手架/半架/吊篮/梯子归 10-06 脚手架与平台；盘扣等周转件归 07-09；爬架随 10-06
//   6. 09 大型机具与 10 小型工具同名设备按金额区分（单条≥5000 元归大型机具）：
//      关键词默认归 10，09 仅保留独占大型设备词；前端在金额≥5000 时提示改归大型机具

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
      { code: '01-01', value: '绑扎丝', keywords: ['扎丝', '圈丝', '弹力丝', '废扎丝', '镀锌扎丝', '扎丝钩', '扎钩', '绑丝'] },
      { code: '01-02', value: '钉类', keywords: ['圆钉', '码钉', '水泥钉', '钢排钉', '射钉', '炮钉', '排钉', 'U型钉', '蚊钉', '直钉', '钢钉', '铁钉', '钉子'] },
      { code: '01-03', value: '钢丝·绳·网', keywords: ['铁丝', '钢丝绳', '钢绳', '吊绳', '钢丝网', '铅网', '钢化网', '镀锌挂网', '电焊网', '轧带', '网片', '硬网', '加密网格', '钢丝'] },
      { code: '01-04', value: '紧固件', keywords: ['螺母', '螺栓', '螺丝', '螺杆', '丝杆', '对拉丝', '拉杆', '山型卡', '三型卡', '41型卡', '步步紧', '锥体母', '膨胀丝', '膨胀管', '膨胀螺栓', '自攻丝', '垫片', '垫圈', '骑马卡', '卡头', '卡扣', '抱箍', '喉箍', '尼龙扎带', '卸扣', '鸡心环', 'U型环', 'U形环', 'U形丝', '铜鼻子', '开口鼻', '合页', '关节', '销子', '开口销', '轴承', '保护帽', '钢筋保护套', '铁片', '压条', '钢筋套筒'] },
      { code: '01-05', value: '金属构件', keywords: ['止水钢板', '工业级钢板', '柱头钢板', '铁板', '角铁', '槽钢', '工字钢', '梅花支架', '滑动支座', '钢筋吊架', '双轮中箱', '铸铁井盖', '格栅板', '钢板'] },
      { code: '01-06', value: '五金其他', keywords: ['接地针', '接地桩', '手提箱', '异形铁件', '小五金'] },
    ],
  },
  {
    code: '02',
    value: '电线电气',
    keywords: ['电工', '电气'],
    subcategories: [
      { code: '02-01', value: '电线电缆', keywords: ['电线', '电缆', '软电线', '灯线', '插板线', '花线', '铝线', '铝护套线', '防老化铝线', '双色线', 'BVR', '铜线', '护套线', '防火连接线', '电源线', '焊机把线'] },
      { code: '02-02', value: '线管线槽', keywords: ['PVC管', 'PVC线管', '线管', '线槽', '波纹管', '穿线管', '穿筋管', '黄腊管'] },
      { code: '02-03', value: '配电箱柜', keywords: ['配电箱', '插板箱', '插座箱', '充电箱', '防爆电箱', '三级箱', '综合箱', '电箱腿', '电箱锁', '电箱'] },
      { code: '02-04', value: '开关插座', keywords: ['插头', '插座', '插排', '插板', '插线板', '地拖插排', '三插', '五插', '底座', '按钮', '开关', '连接器', '航空插', '公牛'] },
      { code: '02-05', value: '保护电器', keywords: ['空开', '漏电保护器', '漏保', '断路器', '交流接触器', '交流器', '继电器', '时控开关', '电表', '变频器', '变压器', '磁力启动器', '熔断器', '保险丝', '电闸'] },
      { code: '02-06', value: '照明灯具', keywords: ['灯泡', '灯管', 'LED灯', '灯带', '灯头', '头灯', '充电灯', '塔吊灯', '节能灯', '碘钨灯', '应急灯', '灯具'] },
      { code: '02-07', value: '电池电瓶', keywords: ['电池', '电瓶', '充电器', '充电线', '换电池'] },
      { code: '02-08', value: '绝缘胶带', keywords: ['电工胶布', '黄胶带', '防水胶布', '高压胶带', '海绵胶带', '绝缘胶带', '胶布'] },
      { code: '02-09', value: '电气其他', keywords: ['绝缘挂钩', '电缆挂钩', '三角节', '线排'] },
    ],
  },
  {
    code: '03',
    value: '水暖管件',
    keywords: ['水暖'],
    subcategories: [
      { code: '03-01', value: '管材管件', keywords: ['水管', 'PE管', 'PPR', 'PVC水管', '钢管', '架子管', '软管', '钢丝软管', '水带', '穿墙管', '墙管', '排烟管', '气管', '油管', '加热管', '锥形管', '锥型套管', '套管', '管材', '管子'] },
      { code: '03-02', value: '管件配件', keywords: ['直接', '弯头', '三通', '大小头', '变径', '接头', '软管接头', '管卡', '吊卡', '卡子', '球阀', '阀门', '水龙头', '加长龙头', '洗衣机龙头', '胶圈', '生料带', '上水垫', '堵漏王', '膨胀上下水环'] },
      { code: '03-03', value: '水暖其他', keywords: [] },
    ],
  },
  {
    code: '04',
    value: '焊接耗材',
    keywords: ['焊接'],
    subcategories: [
      { code: '04-01', value: '焊条焊丝', keywords: ['焊条', '焊丝', '药芯焊丝', '金桥焊条'] },
      { code: '04-02', value: '切割打磨片', keywords: ['切割片', '切片', '砂轮片', '磨光片', '角磨片', '磨片', '锯片', '瓷砖切割片', '马路切割片', '手提切割片', '抛光片'] },
      { code: '04-03', value: '焊把与配件', keywords: ['焊把', '焊把线', '电焊钳', '焊把钳', '焊帽', '电焊面罩', '面罩', '火花石', '打火器', '割枪', '喷嘴'] },
      { code: '04-04', value: '焊接其他', keywords: ['喷火枪', '白灰'] },
    ],
  },
  {
    code: '05',
    value: '劳保安全',
    keywords: ['劳保'],
    subcategories: [
      { code: '05-01', value: '头部防护', keywords: ['安全帽', '帽贴', '帽衬', '帽类'] },
      { code: '05-02', value: '坠落防护', keywords: ['安全带', '安全网', '密目网', '白兜网', '兜网', '安全绳', '缓冲器', '防坠器', '爬梯护笼'] },
      { code: '05-03', value: '防护服装', keywords: ['马甲', '马夹', '反光背心', '反光衣', '雨衣', '雨鞋', '水鞋', '劳保鞋', '绑腿', '手套', '口罩', '防晒帽', '遮阳伞', '袖套', '工作服'] },
      { code: '05-04', value: '消防器材', keywords: ['灭火器', '消防钉', '防火布', '消防栓', '消防水带', '灭火毯', '消防'] },
      { code: '05-05', value: '安全标识', keywords: ['布标', '警示带', '警戒带', '警示线', '标识牌', '标牌', '护栏', '道口条', '印字条幅', '安全标语'] },
      { code: '05-06', value: '文明施工', keywords: ['垃圾袋', '垃圾桶', '棉毡', '藿香正气', '草皮', '防尘网', '洗车台'] },
      { code: '05-07', value: '劳保其他', keywords: ['劳保用品'] },
    ],
  },
  {
    code: '06',
    value: '油料化工',
    keywords: ['化工'],
    subcategories: [
      { code: '06-01', value: '燃油费', keywords: ['加油费', '叉车加油', '柴油', '汽油'] },
      { code: '06-02', value: '界面剂', keywords: ['界面剂'] },
      { code: '06-03', value: '脱模养护', keywords: ['脱模剂', '模板油', '铝模油', '养护剂', '养护液', '薄膜养护剂'] },
      { code: '06-04', value: '稀料溶剂', keywords: ['稀料', '稀释剂', '松香水', '香蕉水', '松浆水', '草酸', '丙酮', '洗剂'] },
      { code: '06-05', value: '胶粘剂', keywords: ['胶水', '万能胶', '108胶', '901胶', '植筋胶', '结构胶', '云石胶', '密封胶', '发泡胶', '发泡剂', '白乳胶', '纤维素', '羟丙基甲基纤维素'] },
      { code: '06-06', value: '防水材料', keywords: ['防水涂料', '防水砂浆', '聚氨酯', '水性聚氨酯', '丙纶', 'SBS', '沥青胶泥', '渗透结晶', '堵漏材料', '油膏', '沥青', '防水'] },
      { code: '06-07', value: '腻子砂浆', keywords: ['腻子粉', '腻子', '抗裂砂浆', '干拌砂浆', '灌浆料', '找平砂浆', '粉刷石膏', '砂浆'] },
      { code: '06-08', value: '油脂润滑油', keywords: ['机油', '液压油', '齿轮油', '黄油', '乳化油', '乳化液', '皂化液', '油桶', '润滑油', '锂基脂'] },
      { code: '06-09', value: '油漆涂料', keywords: ['调和漆', '磁漆', '乳胶漆', '自喷漆', '防锈漆', '防腐漆', '外墙漆', '色差调整剂', '铁锈转换剂', '白粉', '大白', '油漆', '涂料', '颜料'] },
      { code: '06-10', value: '化工其他', keywords: ['美纹纸', '油漆刷', '排刷', '滚刷', '滚筒刷', '砂浆箱板', '液化气'] },
    ],
  },
  {
    code: '07',
    value: '周转辅材',
    keywords: ['周转', '摊销'],
    subcategories: [
      { code: '07-01', value: '水泥垫块支撑', keywords: ['水泥垫块', '水泥支撑', '水泥条', '撑杆', '水泥撑杆', '水泥撑条', '内撑', '保护层垫块', '垫块'] },
      { code: '07-02', value: '方木与模板', keywords: ['方木', '木方', '模板', '胶合板', '竹胶板', '铝模', '铝膜及配件', '架板', 'K板', '一次性板', '木模板', '塑料模板', '覆膜板'] },
      { code: '07-03', value: '拉片与杆件', keywords: ['铝模拉片', '拉片', '周转外杆', '防水外杆', '铝膜管', '方管板', '站立板', '斜斗', '对拉螺杆', '顶托'] },
      { code: '07-04', value: '网格与护角', keywords: ['网格布', '网格带', '阳角条', '护角', '阴阳角', '踢脚线', '滴水线', '滴水条', '分水条', '抗裂网', '玻纤网'] },
      { code: '07-05', value: '薄膜与地膜', keywords: ['地膜', '薄膜', '农膜', '塑料布', '塑料套', '无纺布', '地板革', '养护膜', '防尘膜'] },
      { code: '07-06', value: '篷布与苫盖', keywords: ['彩条布', '篷布', '棚布', '蓬布', '防雨布', '苫布', '编织袋', '吨包袋', '米袋子', '牛皮袋', '旧塑料袋', '双径布', '尼龙布', '料布'] },
      { code: '07-07', value: '封装辅材', keywords: ['双面胶', '打包带', '扎带', '打包扣', '塑钢带', '封箱带', '缠绕膜'] },
      { code: '07-08', value: '临设与板房', keywords: ['活动板房', '活动房', '板房', '围挡', '库房', '临建房', '加厚桶', '加热桶'] },
      { code: '07-09', value: '周转其他', keywords: ['四氟板', '编压板', '挤塑板', '岩棉板', '试模', '抗渗试模', '盘扣', '扣件', '十字扣件', '架管', '钢跳板', '跳板'] },
    ],
  },
  {
    code: '08',
    value: '其他材料',
    keywords: ['其他'],
    subcategories: [
      { code: '08-01', value: '水泥建材', keywords: ['白水泥', '425白水泥', '水泥', '加气块', '沙子', '白石灰', '海螺水泥', 'EPS线条', '聚乙烯醇', '修补材料', '修补白水泥', '建材'] },
      { code: '08-02', value: '办公与生活', keywords: ['文件柜', '沙发', '办公桌', '椅子', '凳子', '打印纸', 'A4纸', '粉盒', '硒鼓', '碳粉', '墨盒', '墨汁', '笔', '本', '订书针', '印泥', '打印机', '净化器', '净水器', '取暖器', '毛巾', '炒勺', '办公', '施工日志'] },
      { code: '08-03', value: '笼统待补明细', keywords: ['辅材', '零星材料', '材料费', '自购材料', '四方材料', '五鼎辅材', '配件', '码费', '库房材料', '退材料费', '回库房材料'] },
      // 08-04 未分类待确认：无关键词，guessMiscCategory 全不匹配时的兜底（subcategory=null）
    ],
  },
  {
    code: '09',
    value: '大型机具',
    // 同名设备关键词归 10，金额≥5000 由前端提示改归本类；此处仅保留大型独占设备
    keywords: ['挖掘机', '装载机', '压路机', '塔吊', '起重机', '施工电梯', '升降机', '混凝土泵车', '罐车', '发电机', '台班', '大型机械'],
    subcategories: [
      { code: '09-01', value: '钢筋机械', keywords: [] },
      { code: '09-02', value: '混凝土机械', keywords: ['地泵', '布料机'] },
      { code: '09-03', value: '起重与运输', keywords: ['3.5吨内燃叉车', '随车吊', '大挂车', '多功能料斗'] },
      { code: '09-04', value: '测量与仪器', keywords: ['激光扫平仪', '垂准仪'] },
      { code: '09-05', value: '其他大型机具', keywords: ['砌筑抹灰平台', '40黑金刚'] },
    ],
  },
  {
    code: '10',
    value: '小型工具',
    keywords: ['工具'],
    subcategories: [
      { code: '10-01', value: '钢筋机械', keywords: ['调直机', '弯曲机', '弯箍机', '握箍机', '切断机', '套丝机', '滚丝机', '锯床', '钢筋炮台'] },
      { code: '10-02', value: '混凝土机具', keywords: ['振动棒', '振动机', '震动棒', '平板震动器', '振动器', '振动电机', '抹光机', '刮杠', '刮尺', '电刮尺', '电动刮平尺', '真平机', '夯机', '电动夯机'] },
      { code: '10-03', value: '焊接设备', keywords: ['电焊机', '焊机', '焊烟机', '焊线', '焊把'] },
      { code: '10-04', value: '水泵与空压', keywords: ['污水泵', '自吸泵', '水泵', '气泵', '空压机', '地泵', '施泵', '大泵', '泵管', '泵卡', '防爆管'] },
      { code: '10-05', value: '测量仪器', keywords: ['水准仪', '经纬仪', '全站仪', '卷尺', '钢尺', '靠尺', '水平尺', '线坠', '墨斗', '墨汁线', '施工线', '塔尺', '五线仪', '红外线', '三脚架', '万能表', '万用表', '检验尺', '水平仪'] },
      { code: '10-06', value: '脚手架与平台', keywords: ['脚手架', '半架', '架子床', '爬架', '操作平台', '吊篮', '升降平台', '梯子', '伸缩梯', '人字梯', '爬梯', '厚丰架', '铝合金粉刷架', '移吊篮'] },
      { code: '10-07', value: '通讯与电器', keywords: ['对讲机', '喊话器', '喇叭', '空调', '取暖器', '暖风机', '净化器', '净水器', '内机', '电脑版'] },
      { code: '10-08', value: '仓储与临设', keywords: ['货架', '料架', '库房箱柜', '台板案子', '料布台'] },
      { code: '10-09', value: '运输与吊装', keywords: ['手推车', '斗车', '平板车', '三轮车', '地牛', '料斗', '料台', '叉车', '吊链', '拉马', '紧绳器', '拉紧器', '千斤顶', '吊带', '吊装带', '托盘', '轮胎', '内胎', '翻斗车'] },
      { code: '10-10', value: '机具配件耗材', keywords: ['钻头', '批头', '锯条', '簪子', '碳刷', '滚丝轮', '开孔器', '叶片', '刀片', '圆刀', '方刀', '刀架', '电锤头', '镐头', '钳头', '轮子', '滚轮', '万向轮', '主动轮', '多孔轮', '米伦', '米轴', '偏心轴', '皮带', '三角带', '油封', '齿轮', '牙包', '电机', '电动机', '马达', '控制器', '遥控器', '转把', '手刹', '手把', '电机线圈', '风叶', '风罩', '喷头', '火花塞', '滤芯'] },
      { code: '10-11', value: '电动工具', keywords: ['电锤', '电镐', '电钻', '角磨机', '磨光机', '切割机', '电锯', '云石机', '切缝机', '切砖机', '石材切割机', '飞机钻', '手枪钻', '曲线锯', '台锯', '木工锯', '吹风机', '喷雾器', '喷绘机', '砂轮', '锂电工具', '打磨机', '手提磨面机', '射钉枪', '炮钉枪'] },
      { code: '10-12', value: '手工工具', keywords: ['扳手', '钳子', '锤子', '羊角锤', '斧头', '铁锨', '铁锹', '洋镐', '洋稿', '十字镐', '耙子', '钢钎', '撬棍', '撬杠', '管钳', '螺丝刀', '剪刀', '铲子', '铁头', '钢锯', '锹', '钢筋剪', '抹子', '铁磨子', '灰板', '抹片', '刮挂杆', '扎钩'] },
      { code: '10-13', value: '清扫与容器', keywords: ['扫把', '扫帚', '簸箕', '笤帚', '灰桶', '灰盒', '水桶', '水盘', '泥桶', '灰斗车', '水箱', '灰槽', '灰盆', '塑料水塔', '水池', '沥水斗', '方篦子', '烟灰缸'] },
      { code: '10-14', value: '机具其他', keywords: ['机具'] },
    ],
  },
  {
    code: '11',
    value: '运费',
    keywords: ['运费'],
    subcategories: [
      { code: '11-01', value: '材料运输', keywords: ['材料运费', '拉货', '送货运费', '退料运费', '返库运费', '调拨运费', '拉运费', '转运费', '倒运费'] },
      { code: '11-02', value: '装卸叉车费', keywords: ['叉车费', '装车费', '卸车费', '码费', '装卸费', '搬运费', '人工装卸'] },
      { code: '11-03', value: '机械运输', keywords: ['机械运费', '吊车费', '随车吊', '吊泵车', '设备转场', '机械调拨运费'] },
      { code: '11-04', value: '物流快递', keywords: ['物流费', '快递费', '顺丰', '邮费', '货拉拉', '跑腿费', '邮寄费', '物流', '快递'] },
      { code: '11-05', value: '车费差旅', keywords: ['车费', '差旅车费', '过路费', '市内交通费'] },
    ],
  },
  {
    code: '12',
    value: '施工杂费',
    keywords: ['打扫', '清理', '垃圾清运', '保洁', '冲洗', '抽水', '排水', '临建', '场地平整', '杂工', '零工', '打杂', '清渣', '清灰'],
    subcategories: [
      { code: '12-01', value: '维修保养', keywords: ['维修费', '修理费', '修电机', '修水泵', '维修电镐', '三轮车维修', '电动车维修', '空调维修', '叉车保养', '上门费', '安装费', '换电池', '换件工时', '维修', '保养'] },
      { code: '12-02', value: '检测与校准', keywords: ['检测费', '检测尺', '仪器检测', '仪器鉴定', '校准', '检测报告', '试验费', '检测'] },
      { code: '12-03', value: '租赁费', keywords: ['叉车租赁', '设备租赁', '盘扣租赁', '钢管租赁', '租赁'] },
      { code: '12-04', value: '加工与人工', keywords: ['加工费', '人工费', '工费', '手工费', '车床加工', '制作费'] },
      { code: '12-05', value: '机械与吊装', keywords: ['随车吊费用', '吊泵车费用', '卸机械费', '吊车费用'] },
      { code: '12-06', value: '税费规费', keywords: ['税费', '税款', '税钱', '信息服务费', '规费'] },
      { code: '12-07', value: '餐饮招待', keywords: ['餐费', '加班餐费', '司机餐费', '买饭', '招待费', '招待烟'] },
      { code: '12-08', value: '其他杂费', keywords: ['水费', '零星费用', '自建房费用', '绑腿费用'] },
    ],
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
