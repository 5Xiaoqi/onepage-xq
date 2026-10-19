/* 一页 · 记账文本解析：把截图里的文字变成一笔账
 * 覆盖：微信/支付宝支付成功页、淘宝京东美团订单、银行短信、超市小票、账单汇总
 */

import { dayKey, pad2 } from './util.js';

/* ---------------- 分类 ---------------- */

export const EXPENSE_CATEGORIES = [
  { id: 'food', name: '餐饮', emoji: '🍜', color: '#D9703F', keys: ['餐', '饭', '面馆', '米粉', '火锅', '烧烤', '咖啡', '奶茶', '茶饮', '蛋糕', '面包', '早餐', '午餐', '晚餐', '夜宵', '饺子', '寿司', '汉堡', '披萨', '食堂', '小吃', '零食', '水果', '生鲜', '买菜', '菜市场', '外卖', '饿了么', '星巴克', '瑞幸', '麦当劳', '肯德基', '蜜雪', '喜茶', '奈雪', '海底捞', '美团'] },
  { id: 'transport', name: '交通', emoji: '🚇', color: '#4A78B8', keys: ['打车', '滴滴', '出租车', '地铁', '公交', '高铁', '火车', '机票', '航班', '航空', '加油', '充电桩', '停车', '高速', '单车', '骑行', '哈啰', '青桔', '车费', '交通', '油费'] },
  { id: 'shopping', name: '购物', emoji: '🛍️', color: '#B05A8E', keys: ['淘宝', '天猫', '京东', '拼多多', '唯品会', '商城', '旗舰店', '服饰', '鞋', '衣服', '数码', '电器', '手机', '电脑', '化妆品', '护肤', '包包', '首饰', '得物'] },
  { id: 'daily', name: '日用', emoji: '🧴', color: '#7C8B4E', keys: ['超市', '便利店', '沃尔玛', '永辉', '盒马', '山姆', '全家', '罗森', '7-11', '日用', '洗护', '纸巾', '清洁', '家居', '五金', '杂货', '名创优品'] },
  { id: 'fun', name: '娱乐', emoji: '🎬', color: '#8A5BA6', keys: ['电影', '影院', '游戏', '会员', '视频', '音乐', 'KTV', '酒吧', '演出', '门票', '旅游', '酒店', '景区', '剧本杀', '展览', '演出票'] },
  { id: 'health', name: '医疗', emoji: '💊', color: '#C0504D', keys: ['医院', '药', '诊所', '挂号', '体检', '口腔', '牙科', '眼科', '医保', '门诊', '药房'] },
  { id: 'home', name: '住房', emoji: '🏠', color: '#9A6B3F', keys: ['房租', '物业', '水费', '电费', '燃气', '维修', '家政', '保洁', '宽带费'] },
  { id: 'telecom', name: '通讯', emoji: '📱', color: '#4E8C8C', keys: ['话费', '流量', '宽带', '中国移动', '中国联通', '中国电信', '手机充值', '通信'] },
  { id: 'edu', name: '教育', emoji: '📚', color: '#5B6FB0', keys: ['学费', '课程', '培训', '图书', '书店', '考试', '报名', '学校', '文具', '网课', '知识付费'] },
  { id: 'social', name: '人情', emoji: '🎁', color: '#C2873A', keys: ['红包', '礼物', '份子', '请客', '生日', '婚礼', '随礼', '慰问'] },
  { id: 'pet', name: '宠物', emoji: '🐾', color: '#A56B4E', keys: ['宠物', '猫粮', '狗粮', '猫砂', '宠物医院', '铲屎'] },
  { id: 'other', name: '其他', emoji: '✨', color: '#8A8578', keys: [] },
];

export const INCOME_CATEGORIES = [
  { id: 'salary', name: '工资', emoji: '💼', color: '#2F7A5E', keys: ['工资', '薪资', '月薪', '薪酬'] },
  { id: 'bonus', name: '奖金', emoji: '🏆', color: '#B08430', keys: ['奖金', '年终', '绩效', '提成'] },
  { id: 'redpacket', name: '红包', emoji: '🧧', color: '#C0504D', keys: ['红包', '压岁', '礼金'] },
  { id: 'refund', name: '退款', emoji: '↩️', color: '#4A78B8', keys: ['退款', '退回', '退费', '退货'] },
  { id: 'invest', name: '理财', emoji: '📈', color: '#5B6FB0', keys: ['利息', '收益', '分红', '理财', '基金', '股票'] },
  { id: 'parttime', name: '兼职', emoji: '🧰', color: '#7C8B4E', keys: ['兼职', '稿费', '外包', '副业', '项目款'] },
  { id: 'other_income', name: '其他', emoji: '✨', color: '#8A8578', keys: [] },
];

const CATEGORY_INDEX = new Map(
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c])
);

export function categoryById(id) {
  return CATEGORY_INDEX.get(id) || CATEGORY_INDEX.get('other');
}

/** 分类规则按顺序优先匹配，命中即返回 */
const CATEGORY_RULES = [
  ['transport', /(打车|滴滴|出租车|网约车|地铁|公交|高铁|动车|火车票|机票|航班|航空|加油|充电桩|停车费|高速费|共享单车|单车|骑行|哈啰|青桔|车费|交通费|油费)/],
  ['food', /(外卖|饿了么|美团外卖|餐厅|餐饮|饭馆|饭店|面馆|米粉|火锅|烧烤|咖啡|奶茶|茶饮|蛋糕|面包|早餐|午餐|晚餐|夜宵|饺子|寿司|汉堡|披萨|食堂|小吃|零食|水果|生鲜|菜市场|买菜|星巴克|瑞幸|麦当劳|肯德基|蜜雪|喜茶|奈雪|海底捞|西贝|沙县)/],
  ['telecom', /(话费|流量包|宽带|中国移动|中国联通|中国电信|手机充值|通信费)/],
  ['home', /(房租|租金|物业费|水费|电费|燃气费|采暖|维修费|家政|保洁|开锁)/],
  ['health', /(医院|药店|药房|诊所|挂号|体检|口腔|牙科|眼科|门诊|医保|买药|医药)/],
  ['pet', /(宠物|猫粮|狗粮|猫砂|宠物医院|铲屎|猫舍|犬舍)/],
  ['edu', /(学费|课程|培训班|网课|图书|书店|考试费|报名费|学校|文具|知识付费|得到|极客时间)/],
  ['fun', /(电影|影院|游戏|会员费|视频会员|音乐会员|KTV|酒吧|演出|门票|景区|旅游|酒店|民宿|剧本杀|展览|演唱会)/],
  ['shopping', /(淘宝|天猫|京东|拼多多|唯品会|商城|旗舰店|服饰|鞋|衣服|数码|电器|手机|电脑|化妆品|护肤|包包|首饰|得物|苏宁|苹果|iPhone|iPad|MacBook|Apple)/],
  ['daily', /(超市|便利店|便利蜂|美宜佳|沃尔玛|永辉|盒马|山姆|全家|罗森|7-11|711|日用|洗护|纸巾|清洁|家居|五金|杂货|名创优品|屈臣氏)/],
  ['social', /(红包|礼物|份子|请客|随礼|婚礼|生日礼|慰问)/],
];

function guessCategory(text, type) {
  const hay = String(text || '');
  if (type === 'income') {
    for (const cat of INCOME_CATEGORIES) {
      if (cat.keys.some((k) => hay.includes(k))) return cat.id;
    }
    return 'other_income';
  }
  for (const [id, re] of CATEGORY_RULES) {
    if (re.test(hay)) return id;
  }
  let best = null;
  let bestScore = 0;
  for (const cat of EXPENSE_CATEGORIES) {
    for (const k of cat.keys) {
      if (hay.includes(k) && k.length > bestScore) {
        best = cat.id;
        bestScore = k.length;
      }
    }
  }
  return best || 'other';
}

/* ---------------- 文本规整 ---------------- */

export function normalizeText(input) {
  let s = String(input || '');
  s = s.replace(/\u00a0|\u3000/g, ' ');
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[：]/g, ':').replace(/[，]/g, ',');
  s = s.replace(/[－—–]/g, '-');
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\r\n?/g, '\n');
  return s.trim();
}

/* ---------------- 金额 ---------------- */

const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
const AMOUNT_TOKEN = new RegExp(
  `(?:[¥￥]\\s*${NUM})|(?:${NUM}\\s*元)|(?:(?:RMB|rmb|人民币)\\s*${NUM})`,
  'g'
);

const EXCLUDE_BEFORE = /(尾号|卡号|账号|订单号|单号|编号|序号|手机号|电话|验证码|余额|积分|优惠|立减|折扣|券|码|第|共|数量|件数)/;
const EXCLUDE_CURRENCY = /(尾号|卡号|账号|订单号|单号|编号|余额|积分)/;

function pickGroup(m) {
  // 三个分支各有一个捕获组，取第一个有值的
  for (let i = 1; i < m.length; i++) if (m[i]) return m[i];
  return null;
}

function toCents(numStr) {
  const n = parseFloat(String(numStr).replace(/,/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

function scanAmounts(text) {
  const out = [];
  AMOUNT_TOKEN.lastIndex = 0;
  let m;
  while ((m = AMOUNT_TOKEN.exec(text))) {
    const raw = pickGroup(m);
    if (!raw) continue;
    const cents = toCents(raw);
    if (cents <= 0 || cents > 500000000) continue;
    const before = text.slice(Math.max(0, m.index - 10), m.index);
    const isCurrency = /[¥￥]/.test(text.slice(m.index, m.index + 1));
    const excluded = isCurrency ? EXCLUDE_CURRENCY.test(before) : EXCLUDE_BEFORE.test(before);
    if (excluded) continue;
    out.push({ cents, index: m.index, raw });
  }
  return out;
}

const LABEL_RULES = [
  { key: '实付', re: new RegExp(`(?:实付款?|实际支付|实际付款|支付金额|付款金额|消费金额|交易金额|扣款金额|应付金额)\\s*:?\\s*(?:[¥￥]\\s*)?${NUM}`) },
  { key: '合计', re: new RegExp(`(?:合计|总计|总额|总价|小计|应付|实收|应收|金额|订单金额)\\s*:?\\s*(?:[¥￥]\\s*)?${NUM}`) },
];

function findLabeledAmount(text) {
  for (const rule of LABEL_RULES) {
    const m = text.match(rule.re);
    if (m) {
      for (let i = 1; i < m.length; i++) {
        if (m[i]) return { cents: toCents(m[i]), label: rule.key };
      }
    }
  }
  return null;
}

/* ---------------- 收支方向 ---------------- */

const INCOME_HINTS = /(退款|退回|退费|收款|入账|到账|收入|工资|薪资|奖金|红包收|收到|转入|报销|利息|收益|分红|提现成功|卖出)/;
const EXPENSE_HINTS = /(支付成功|付款|消费|支出|扣款|实付|购买|下单|转给|转账给|缴费|充值|订阅|续费|打车|外卖)/;

function guessType(text) {
  if (/退款|退货|退回/.test(text)) return 'income';
  if (/(收到|收款|入账|到账|收入|工资|奖金|利息|分红)/.test(text) && !/支付成功/.test(text)) return 'income';
  const inc = (text.match(INCOME_HINTS) || []).length;
  const exp = (text.match(EXPENSE_HINTS) || []).length;
  if (inc > exp) return 'income';
  return 'expense';
}

/* ---------------- 商户 ---------------- */

const MERCHANT_LABEL =
  /(商户全称|商户名称|商家名称|商户名|收款方|收款人|收款商户|对方户名|对方名称|交易对方|付款方|付款给|转账给|店铺名称|店铺名|卖家名称|卖家|商家|收款单位)\s*:?\s*([^\n]{1,48})/;

const BRANDS = [
  '星巴克', '瑞幸咖啡', '瑞幸', '麦当劳', '肯德基', '汉堡王', '必胜客', '海底捞', '西贝莜面村', '西贝',
  '喜茶', '奈雪的茶', '奈雪', '蜜雪冰城', '蜜雪', '茶百道', '古茗', '沪上阿姨', '霸王茶姬', '库迪咖啡', '库迪',
  '美团单车', '美团外卖', '美团', '饿了么', '大众点评',
  '滴滴出行', '滴滴', '高德打车', '哈啰', '青桔', '曹操出行', 'T3出行',
  '淘宝', '天猫', '京东', '拼多多', '唯品会', '苏宁易购', '苏宁', '得物', '闲鱼', '抖音商城',
  '盒马鲜生', '盒马', '山姆会员店', '山姆', '永辉超市', '永辉', '沃尔玛', '家乐福', '大润发', '华润万家',
  '全家', '罗森', '7-ELEVEn', '7-11', '便利蜂', '美宜佳', '名创优品', '屈臣氏', '无印良品', 'MUJI',
  '中国移动', '中国联通', '中国电信', '国家电网', '南方电网',
  '中国石化', '中国石油', '壳牌', '特来电', '星星充电',
  '顺丰速运', '顺丰', '菜鸟驿站', '中通快递', '圆通速递', '韵达快递', '京东物流',
  '万达影城', 'CGV影城', '猫眼电影', '淘票票', '大麦网',
  '携程', '去哪儿', '飞猪', '同程旅行', '华住会', '亚朵', '全季酒店',
  '苹果', 'Apple', '小米', '华为', '优衣库', '迪卡侬', '宜家', 'IKEA',
  '网易云音乐', '腾讯视频', '爱奇艺', '优酷', '哔哩哔哩', 'B站', '知乎', '得到',
].sort((a, b) => b.length - a.length);

const LINE_NOISE =
  /(支付|账单|详情|订单|时间|方式|余额|银行卡|零钱|优惠|折扣|积分|备注|说明|状态|完成|成功|失败|退款|客服|发票|收货|地址|物流|快递|运费|合计|总计|金额|数量|件|笔|交易|商户|收款|付款|转账|二维码|扫一扫|微信|支付宝|云闪付|信用卡|储蓄卡|尾号|账户|银行|人民币|元|¥|￥|\d{3,})/;

function isNoisyLine(line) {
  if (!line) return true;
  if (LINE_NOISE.test(line)) return true;
  if (/^[\d\s.:\-/年月日]+$/.test(line)) return true;
  if (line.length < 2 || line.length > 30) return true;
  return false;
}

function cleanMerchant(v) {
  let s = String(v || '').split(/\s{2,}/)[0];
  s = s.replace(/^[:\s]+/, '');
  s = s.replace(/[（(].*?[)）]\s*$/, '');
  s = s.replace(/[\s,，。;；·]+$/, '');
  return s.trim();
}

function findMerchant(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. 带标签的字段（取最具体的）
  for (const line of lines) {
    const m = line.match(MERCHANT_LABEL);
    if (m) {
      let v = cleanMerchant(m[2]);
      // “商户全称” 后面若为空，试下一行
      if (!v || /^[:：]?$/.test(v)) continue;
      if (v.length >= 2 && !/^\d+$/.test(v)) return v;
    }
  }

  // 2. 知名品牌
  for (const brand of BRANDS) {
    if (text.includes(brand)) return brand;
  }

  // 3. 按行打分找最像店名的一行
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isNoisyLine(line)) continue;
    let score = 0;
    if (/(公司|门店|店|超市|餐厅|餐饮|咖啡|茶|药房|医院|影院|酒店|广场|中心|科技|商贸|实业|集团|工作室|馆|行|社|城|苑|铺|坊|记)/.test(line)) score += 3;
    if (line.length >= 2 && line.length <= 16) score += 2;
    if (i < lines.length / 2) score += 1;
    if (/^[\u4e00-\u9fa5A-Za-z0-9·\-\s（）()]+$/.test(line)) score += 1;
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  if (best && bestScore >= 3) return cleanMerchant(best);
  return '';
}

/* ---------------- 时间 ---------------- */

const BANKS = [
  '招商银行', '工商银行', '建设银行', '农业银行', '中国银行', '交通银行', '邮储银行', '中信银行',
  '浦发银行', '民生银行', '兴业银行', '光大银行', '平安银行', '广发银行', '华夏银行', '北京银行',
  '上海银行', '宁波银行', '江苏银行', '微众银行', '网商银行', '农村商业银行', '农商银行',
];

function fitDate(y, mo, d, h, mi, now) {
  const year = y || now.getFullYear();
  const date = new Date(year, mo - 1, d, h, mi, 0, 0);
  if (!y && date.getTime() > now.getTime() + 36 * 3600 * 1000) {
    date.setFullYear(year - 1);
  }
  return date;
}

function parseTime(text, now) {
  let m;

  m = text.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})日?(?:[\sT]+(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return fitDate(+y, +mo, +d, h ? +h : 12, mi ? +mi : 0, now);
    }
  }

  m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号](?:\s*(\d{1,2})\s*[:：]\s*(\d{2}))?/);
  if (m) {
    const [, mo, d, h, mi] = m;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return fitDate(null, +mo, +d, h ? +h : 12, mi ? +mi : 0, now);
    }
  }

  m = text.match(/(今天|昨天|前天|今日|昨日)\s*(?:(\d{1,2})\s*[:：]\s*(\d{2}))?/);
  if (m) {
    const offset = m[1] === '今天' || m[1] === '今日' ? 0 : m[1] === '昨天' || m[1] === '昨日' ? -1 : -2;
    const base = new Date(now);
    base.setDate(base.getDate() + offset);
    if (m[2]) {
      base.setHours(+m[2], +m[3], 0, 0);
    }
    return base;
  }

  m = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*\d{2})?/);
  if (m) {
    const h = +m[1];
    const mi = +m[2];
    if (h < 24 && mi < 60) {
      const base = new Date(now);
      base.setHours(h, mi, 0, 0);
      if (base.getTime() > now.getTime() + 10 * 60000) base.setDate(base.getDate() - 1);
      return base;
    }
  }
  return null;
}

/* ---------------- 账户 ---------------- */

export const ACCOUNTS = ['微信', '支付宝', '银行卡', '云闪付', '现金', '其他'];

function findAccount(text) {
  if (/微信|零钱通|零钱|WeChat/i.test(text)) {
    const tail = (text.match(/尾号\s*(\d{4})/) || [])[1];
    return { account: '微信', detail: tail ? `零钱 · 尾号${tail}` : '零钱' };
  }
  if (/支付宝|花呗|余额宝|蚂蚁|Alipay/i.test(text)) {
    const huabei = /花呗/.test(text) ? '花呗' : /余额宝/.test(text) ? '余额宝' : '余额';
    return { account: '支付宝', detail: huabei };
  }
  if (/云闪付/.test(text)) return { account: '云闪付', detail: '' };
  if (/现金/.test(text)) return { account: '现金', detail: '' };
  const bank = BANKS.find((b) => text.includes(b));
  const tail = (text.match(/(?:尾号|末四位|后四位)\s*[:：]?\s*(\d{4})/) || [])[1];
  if (bank || tail || /银行卡|信用卡|储蓄卡|借记卡/.test(text)) {
    return { account: '银行卡', detail: [bank, tail ? `尾号${tail}` : ''].filter(Boolean).join(' ') };
  }
  return { account: '其他', detail: '' };
}

/* ---------------- 主函数 ---------------- */

const SUMMARY_RE = /(本月(支出|消费|收入|账单)|月度账单|账单汇总|年度账单|收支分析|总支出|总收入|账单统计|消费报告)/;

export function parseReceipt(rawInput, now = new Date()) {
  const rawText = String(rawInput || '');
  const text = normalizeText(rawText);
  const warnings = [];

  if (!text) {
    return { ok: false, error: '内容是空的', rawText };
  }

  const type = guessType(text);
  const isSummary = SUMMARY_RE.test(text);

  const labeled = findLabeledAmount(text);
  const scanned = scanAmounts(text);
  let amountCents = 0;
  let amountSource = '';

  if (labeled) {
    amountCents = labeled.cents;
    amountSource = labeled.label;
  } else if (scanned.length) {
    const biggest = scanned.reduce((a, b) => (b.cents > a.cents ? b : a));
    amountCents = biggest.cents;
    amountSource = scanned.length > 1 ? 'max' : 'plain';
  }

  if (!amountCents) warnings.push('没有识别到金额');
  if (isSummary) warnings.push('这看起来是账单汇总，不是单笔消费，请确认');
  if (amountCents >= 10000000) warnings.push('金额较大，请核对');

  let merchant = findMerchant(text);
  const accountInfo = findAccount(text);
  const when = parseTime(text, now);

  if (!merchant) {
    // 订单类截图没有商户名时，用平台名兜底
    const platform = ['淘宝', '天猫', '京东', '拼多多', '美团', '饿了么', '滴滴', '抖音', '得物', '盒马', '山姆', '闲鱼'].find((p) => text.includes(p));
    merchant = platform || '';
  }
  if (!merchant) {
    if (/退款|退回/.test(text)) merchant = '退款';
    else if (/工资|薪资/.test(text)) merchant = '工资';
    else if (/红包/.test(text)) merchant = '红包';
    else if (/利息|收益|分红/.test(text)) merchant = '理财收益';
  }
  if (isSummary) merchant = '';

  if (!when) warnings.push('没识别到时间，已用当前时间');
  if (!merchant) warnings.push('没识别到商户，可手动补充');

  const hay = [merchant, text].join(' ');
  const merchantCategory = merchant ? guessCategory(merchant, type) : null;
  const category =
    merchantCategory && !/^other/.test(merchantCategory)
      ? merchantCategory
      : guessCategory(hay, type);

  if (amountSource === 'max' && scanned.length > 2 && !isSummary) {
    warnings.push('页面里有多个金额，已取最大值，请核对');
  }

  const confidence = Math.round(
    ((amountCents ? 1 : 0) + (merchant ? 1 : 0) + (when ? 1 : 0) + (accountInfo.account !== '其他' ? 1 : 0)) * 25
  );

  return {
    ok: !!amountCents,
    type: type === 'income' && !/退款/.test(text) ? 'income' : type,
    amountCents,
    merchant,
    category,
    account: accountInfo.account,
    accountDetail: accountInfo.detail,
    occurredAt: (when || now).toISOString(),
    note: '',
    confidence,
    amountSource,
    isSummary,
    warnings,
    rawText,
    _debug: { scanned: scanned.length, labeled: labeled?.label || null },
  };
}

/* ---------------- 重复检测 ---------------- */

/** 金额 + 商户相同、且在同一天附近，视为可能重复 */
export function findDuplicate(candidate, transactions = []) {
  const t = new Date(candidate.occurredAt).getTime();
  return transactions.find((x) => {
    if (x.amountCents !== candidate.amountCents) return false;
    const sameMerchant =
      (x.merchant || '').trim() &&
      (candidate.merchant || '').trim() &&
      (x.merchant.includes(candidate.merchant) || candidate.merchant.includes(x.merchant));
    if (!sameMerchant && !candidate.merchant) {
      // 没有商户时，只按 1 小时内同金额判断
      return Math.abs(new Date(x.occurredAt).getTime() - t) < 3600 * 1000;
    }
    return Math.abs(new Date(x.occurredAt).getTime() - t) < 3 * 86400 * 1000 && !!sameMerchant;
  });
}
