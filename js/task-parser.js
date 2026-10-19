/* 一页 · 任务解析：一句话 → 任务样式 + 截止时间 + 拆解步骤
 * 支持：明天下午3点前 / 每周一 / 每月15号 / 3天后 / 周五 / 今晚8点 / 月底
 */

import { addDays, startOfDay, dayKey, clamp, uid, cnNumber, pad2, daysApart } from './util.js';

export const TASK_STYLES = {
  deadline: { label: '截止', icon: 'flag', color: '#C4553B', soft: '#F8E8E2', desc: '有明确的交付时间' },
  habit: { label: '习惯', icon: 'repeat', color: '#2F7A5E', soft: '#E4F1EC', desc: '会重复发生，按天打卡' },
  project: { label: '项目', icon: 'layers', color: '#4A5FA5', soft: '#E8ECF8', desc: '需要多步才能完成' },
  waiting: { label: '等待', icon: 'hourglass', color: '#B07A2A', soft: '#F7EEDD', desc: '卡在别人身上，需要跟进' },
  appointment: { label: '约会', icon: 'calendar', color: '#8A5BA6', soft: '#F0E8F7', desc: '固定时间要出现' },
  quick: { label: '琐事', icon: 'bolt', color: '#6B7280', soft: '#EDEEF0', desc: '两分钟能做完' },
  normal: { label: '待办', icon: 'check', color: '#1F8A70', soft: '#E4F1EC', desc: '普通待办事项' },
};

export const PRIORITY = {
  high: { label: '重要', color: '#C4553B' },
  normal: { label: '普通', color: '#8F8A7C' },
  low: { label: '不急', color: '#7C8B4E' },
};

/* ---------------- 拆解模板 ---------------- */

const TEMPLATES = [
  {
    id: 'report',
    test: /(报告|汇报|周报|月报|总结|方案|提案|PPT|ppt|演示|复盘|策划)/,
    steps: [
      ['明确主题、读者和验收标准', 15],
      ['收集资料与数据', 40],
      ['搭出结构大纲', 20],
      ['写完初稿', 60],
      ['修改润色并检查细节', 30],
      ['提交或汇报', 15],
    ],
  },
  {
    id: 'paper',
    test: /(论文|开题|文献|答辩|毕业设计|课题)/,
    steps: [
      ['确定研究问题与范围', 30],
      ['文献检索与综述', 90],
      ['研究/实验/数据整理', 120],
      ['写出初稿', 120],
      ['修改、查重、格式', 60],
      ['提交并准备答辩', 40],
    ],
  },
  {
    id: 'interview',
    test: /(面试|求职|简历|作品集|跳槽)/,
    steps: [
      ['研究公司与岗位要求', 30],
      ['梳理3个能讲的項目经历', 45],
      ['准备高频问题答案', 45],
      ['模拟面试一次', 30],
      ['准备材料、着装与路线', 20],
      ['面试后复盘记录', 15],
    ],
  },
  {
    id: 'travel',
    test: /(旅行|旅游|出游|度假|签证|行程)/,
    steps: [
      ['确定日期、预算和同行人', 20],
      ['订机票/火车票和酒店', 40],
      ['排出每天大致行程', 30],
      ['准备证件、货币、电话卡', 20],
      ['出发前打包清单', 15],
    ],
  },
  {
    id: 'exam',
    test: /(考试|复习|备考|考研|雅思|托福|证书|驾照|考公)/,
    steps: [
      ['梳理考纲和题型', 30],
      ['拆分知识点清单', 30],
      ['第一轮过完教材', 120],
      ['刷题并标记错题', 90],
      ['错题二刷', 45],
      ['考前串讲与状态调整', 30],
    ],
  },
  {
    id: 'move',
    test: /(搬家|租房|退租|入住|找房)/,
    steps: [
      ['确定预算、通勤和入住时间', 20],
      ['看房并确认房源', 60],
      ['断舍离与打包', 90],
      ['预约搬家公司/货车', 20],
      ['水电燃气网络过户', 30],
      ['入住后整理', 60],
    ],
  },
  {
    id: 'decorate',
    test: /(装修|改造|硬装|软装|翻新)/,
    steps: [
      ['确定风格与总预算', 30],
      ['找设计/施工方并比价', 60],
      ['确定主材与家电清单', 60],
      ['水电、泥木、油漆节点验收', 90],
      ['软装进场', 45],
      ['整体验收与保修归档', 30],
    ],
  },
  {
    id: 'reimburse',
    test: /(报销|发票|差旅|对账)/,
    steps: [
      ['收集并核对发票', 20],
      ['填写报销单', 15],
      ['提交审批并跟进', 10],
      ['到账后核对金额', 5],
    ],
  },
  {
    id: 'fitness',
    test: /(健身|跑步|减肥|训练|瑜伽|增肌|马拉松)/,
    steps: [
      ['设定目标和周期', 15],
      ['制定每周训练计划', 20],
      ['完成第一次训练', 45],
      ['记录数据（体重/配速）', 10],
      ['每周复盘并调整', 15],
    ],
  },
  {
    id: 'learn',
    test: /(学习|学英语|背单词|课程|读书|看完|入门|掌握)/,
    steps: [
      ['明确学完能做什么', 15],
      ['选一份主教材', 15],
      ['拆成每天20分钟的任务', 20],
      ['完成第一轮学习', 60],
      ['做一次自测', 20],
      ['复盘并补薄弱点', 30],
    ],
  },
  {
    id: 'event',
    test: /(活动|婚礼|聚会|生日|年会|团建|派对|宴请)/,
    steps: [
      ['确定时间、地点、人数', 20],
      ['列宾客名单并通知', 30],
      ['订场地/餐饮', 30],
      ['采购物料', 45],
      ['排当天流程和分工', 30],
      ['事后收尾与感谢', 20],
    ],
  },
  {
    id: 'waiting',
    test: /(等|等待|催|跟进)/,
    steps: [
      ['礼貌发出跟进消息', 5],
      ['把问题说清楚（要什么、何时要）', 5],
      ['收到后确认并处理', 10],
    ],
  },
];

function breakdownFor(style, title) {
  if (style === 'habit' || style === 'quick' || style === 'waiting') {
    if (style === 'waiting') {
      return TEMPLATES.find((t) => t.id === 'waiting').steps.map(toStep);
    }
    return [];
  }

  const byTemplate = TEMPLATES.find((t) => t.id !== 'waiting' && t.test.test(title));
  if (byTemplate) return byTemplate.steps.map(toStep);

  if (style === 'appointment') {
    return [
      ['确认时间、地点和联系人', 5],
      ['准备要带的材料', 15],
      ['设好出发提醒', 5],
    ].map(toStep);
  }

  if (style === 'deadline' && title.length <= 6) return [];

  if (style === 'project' || style === 'deadline') {
    return [
      ['明确交付物和验收标准', 10],
      ['收集需要的信息', 20],
      ['拆成 3 个可执行步骤', 15],
      ['完成主体', 60],
      ['检查并交付', 15],
    ].map(toStep);
  }
  return [];
}

function toStep([title, minutes]) {
  return { id: uid('sub'), title, minutes, done: false };
}

/* ---------------- 文本 ---------------- */

function normalize(s) {
  return String(s || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}

const CN_NUM_CHARS = '零〇一二两三四五六七八九十';
const REL_DAY = /(大后天|后天|明天|明日|明早|明晚|今晚|今天|今日|昨天|昨日)/;
const WEEKDAY_RE = /(下下|下|本|这|上)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天1-7])/;

function weekdayIndex(ch) {
  if (ch === '日' || ch === '天') return 7;
  if (/[1-7]/.test(ch)) return +ch;
  return { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[ch] || 0;
}

function findDate(text, now) {
  let m;

  m = text.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
    if (!isNaN(d) && +m[2] >= 1 && +m[2] <= 12) return { date: d, matched: m[0], evening: false, morning: false };
  }

  m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const mo = +m[1], day = +m[2];
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      let d = new Date(now.getFullYear(), mo - 1, day, 0, 0, 0, 0);
      if (daysApart(d, now) < -30) d = new Date(now.getFullYear() + 1, mo - 1, day);
      return { date: d, matched: m[0], evening: false, morning: false };
    }
  }

  m = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const mo = +m[1], day = +m[2];
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      let d = new Date(now.getFullYear(), mo - 1, day, 0, 0, 0, 0);
      if (daysApart(d, now) < -30) d = new Date(now.getFullYear() + 1, mo - 1, day);
      return { date: d, matched: m[0], evening: false, morning: false };
    }
  }

  m = text.match(REL_DAY);
  if (m) {
    const map = { 大后天: 3, 后天: 2, 明天: 1, 明日: 1, 明早: 1, 明晚: 1, 今晚: 0, 今天: 0, 今日: 0, 昨天: -1, 昨日: -1 };
    const d = startOfDay(addDays(now, map[m[1]] ?? 0));
    return {
      date: d,
      matched: m[0],
      evening: /晚/.test(m[0]),
      morning: /早/.test(m[0]),
    };
  }

  m = text.match(WEEKDAY_RE);
  if (m && !(m.index > 0 && text[m.index - 1] === '每')) {
    const prefix = m[1] || '';
    const target = weekdayIndex(m[2]);
    const cur = now.getDay() === 0 ? 7 : now.getDay();
    let delta = (target - cur + 7) % 7;
    if (prefix === '下') delta += 7;
    else if (prefix === '下下') delta += 14;
    else if (prefix === '上') delta -= 7;
    else if (!prefix && delta === 0 && now.getHours() >= 20) delta = 7;
    else if (prefix === '本' || prefix === '这') {
      if (delta === 0 && now.getHours() >= 20) delta = 7;
    }
    return { date: startOfDay(addDays(now, delta)), matched: m[0], evening: false, morning: false };
  }

  m = text.match(/(本月|这个月|下个?月)?\s*(月底|月末|月初)/);
  if (m) {
    const isNext = /下/.test(m[1] || '');
    const base = new Date(now.getFullYear(), now.getMonth() + (isNext ? 1 : 0), 1);
    const d = /初/.test(m[2])
      ? new Date(base.getFullYear(), base.getMonth(), 1)
      : new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { date: d, matched: m[0], evening: false, morning: false };
  }

  if (/周末/.test(text)) {
    const cur = now.getDay() === 0 ? 7 : now.getDay();
    const delta = ((6 - cur + 7) % 7) || 7;
    return { date: startOfDay(addDays(now, /下周末/.test(text) ? delta + 7 : delta)), matched: /下?周末/.exec(text)[0], evening: false, morning: false };
  }

  // 3天后 / 2小时后 / 半小时后 / 一个半小时后
  m = text.match(/(\d+|[一二两三四五六七八九十]+)\s*个?\s*半?\s*(天|日|周|星期|小时|钟头|分钟)\s*(?:后|以后|之后|内)/);
  if (m) {
    let n = cnNumber(m[1]);
    if (n === null) n = 1;
    const unit = m[2];
    let ms = 0;
    if (unit === '天' || unit === '日') ms = n * 86400000;
    else if (unit === '周' || unit === '星期') ms = n * 7 * 86400000;
    else if (unit === '小时' || unit === '钟头') ms = n * 3600000;
    else ms = n * 60000;
    if (/半/.test(m[0])) ms += /天|日/.test(unit) ? 43200000 : /小时|钟头/.test(unit) ? 1800000 : 0;
    return { date: new Date(now.getTime() + ms), matched: m[0], exact: true, evening: false, morning: false };
  }

  return null;
}

function applyPeriod(hour, period) {
  if (hour === null || hour > 23) return null;
  if (period) {
    if (/(下午|傍晚|晚上|今晚|明晚)/.test(period) && hour < 12) hour += 12;
    else if (/中午/.test(period) && hour < 11) hour += 12;
    else if (/凌晨/.test(period) && hour === 12) hour = 0;
    else if (/(早上|早晨|清晨|上午|明早)/.test(period) && hour === 12) hour = 0;
    return hour;
  }
  // 没说上午/下午时，1-6 点按下午理解（更符合待办习惯）
  if (hour >= 1 && hour <= 6) hour += 12;
  return hour;
}

function findTime(text, eveningHint = false) {
  const m = text.match(
    new RegExp(`(凌晨|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|今晚|明晚)?\\s*(\\d{1,2}|[${CN_NUM_CHARS}]{1,3})\\s*(?:点|时|[:：])\\s*(半|一刻|三刻|\\d{1,2}|[${CN_NUM_CHARS}]{1,3})?\\s*分?`)
  );
  if (!m) return null;
  const period = m[1] || '';
  let hour = cnNumber(m[2]);
  let minute = m[3] == null || m[3] === '' ? 0 : m[3] === '半' ? 30 : m[3] === '一刻' ? 15 : m[3] === '三刻' ? 45 : cnNumber(m[3]);
  if (hour === null) return null;
  if (minute === null || minute > 59) minute = 0;
  if (!period && eveningHint && hour >= 5 && hour < 12) {
    hour += 12;
  } else {
    hour = applyPeriod(hour, period);
  }
  if (hour === null) return null;
  return { hour, minute, matched: m[0], period };
}

/* ---------------- 重复规则 ---------------- */

function findRecurrence(text, now = new Date()) {
  let m;

  if (/每(天|日)|天天|每日/.test(text)) {
    return { rec: { type: 'daily', interval: 1, time: '09:00' }, matched: /每(天|日)|天天|每日/.exec(text)[0] };
  }
  if (/隔天|每两天|隔日/.test(text)) {
    return { rec: { type: 'daily', interval: 2, time: '09:00' }, matched: /隔天|每两天|隔日/.exec(text)[0] };
  }
  if (/工作日/.test(text)) {
    return { rec: { type: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '09:00' }, matched: /工作日/.exec(text)[0] };
  }
  m = text.match(/每(?:周|星期|礼拜)\s*([一二三四五六日天](?:\s*[、,，和]?\s*[一二三四五六日天])*)(?!\s*次)/);
  if (m) {
    const days = [...new Set([...m[1].replace(/[、,，和\s]/g, '')].map(weekdayIndex).filter(Boolean))];
    return { rec: { type: 'weekly', weekdays: days, time: '09:00' }, matched: m[0] };
  }
  if (/每(?:周|星期|礼拜)末/.test(text)) {
    return { rec: { type: 'weekly', weekdays: [6, 7], time: '09:00' }, matched: /每(?:周|星期|礼拜)末/.exec(text)[0] };
  }
  m = text.match(/每(?:周|星期|礼拜)\s*(\d+|[一二三四五六七八九十]+)\s*次/);
  if (m) {
    const n = cnNumber(m[1]) || 3;
    return { rec: { type: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], times: n, time: '09:00' }, matched: m[0] };
  }
  m = text.match(/每月\s*(\d{1,2})\s*[日号]/);
  if (m) {
    return { rec: { type: 'monthly', day: clamp(+m[1], 1, 31), time: '09:00' }, matched: m[0] };
  }
  if (/每(?:周|星期|礼拜)/.test(text)) {
    const cur = now.getDay() === 0 ? 7 : now.getDay();
    return { rec: { type: 'weekly', weekdays: [cur], time: '09:00' }, matched: /每(?:周|星期|礼拜)/.exec(text)[0] };
  }
  if (/每月/.test(text)) {
    return { rec: { type: 'monthly', day: now.getDate(), time: '09:00' }, matched: /每月/.exec(text)[0] };
  }
  return null;
}

/* ---------------- 样式 ---------------- */

function classify({ raw, title, rec, hasTime, hasBefore }) {
  if (rec) return 'habit';

  if (/(等|等待|催).{0,14}(回复|确认|反馈|消息|结果|审批|电话|回信|答复)/.test(raw) || /^(等|等待|催)/.test(title)) {
    return 'waiting';
  }

  if (/做饭|做菜|洗碗|扫地|拖地|倒垃圾|洗手间/.test(title)) return 'quick';

  const projectVerb = /(写|做|准备|策划|整理|设计|开发|复习|学习|研究|搭建|制作|剪辑|拍摄|翻译|排版|统计|核算|梳理|制定)/;
  const projectNoun = /(报告|方案|ppt|PPT|演示|论文|项目|计划|总结|课程|旅行|装修|搬家|婚礼|活动|预算|简历|作品集|作业|申报|材料|周报|月报|复盘|提案|面试|考试|体检)/;
  const hardProject = projectVerb.test(title) && projectNoun.test(title);

  // 明确的“前” + 单步动作 → 截止型
  if (hasBefore && !hardProject) return 'deadline';

  if (hardProject && !/^(准备|整理)/.test(title)) return 'project';

  if (/(面试|开会|会议|见面|约见|拜访|看医生|复诊|体检|去医院|看牙|拿药|聚餐|上课|培训|出差|领证|拍照|办证|取件|接人|送人|参加)/.test(raw) && hasTime) {
    return 'appointment';
  }

  if (hardProject) return 'project';
  if (hasBefore) return 'deadline';
  if (projectVerb.test(title)) return 'project';
  if (projectNoun.test(title) && title.length > 8) return 'project';

  if (/(买|取|拿|寄|交|打电话|回复|发消息|预约|订|缴|充值|还|送|借|还书)/.test(title) && title.length <= 14) {
    return 'quick';
  }
  return 'normal';
}

/* ---------------- 标题清洗 ---------------- */

function cleanTitle(text, matchedList) {
  let t = text;
  for (const piece of matchedList) {
    if (piece && piece.length) t = t.split(piece).join(' ');
  }
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(准备|整理|写|做|策划|设计|开发|复习|学习)\s*的\s*/, '$1');
  t = t.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
  t = t.replace(/^(记得|别忘了|别忘记|请|帮我|麻烦|需要|要|得|该|在|于|关于)\s*/g, '');
  t = t.replace(/^(之前|以前|前)\s*/, '');
  t = t.replace(/\s+(的|在|于)\s+/g, '$1');
  t = t.replace(/[\s，,、。；;:：!！]+$/g, '');
  t = t.replace(/^[\s，,、。；;:：!！]+/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

/* ---------------- 主函数 ---------------- */

export function parseTask(input, now = new Date()) {
  const raw = normalize(input);
  if (!raw) return null;

  const recInfo = findRecurrence(raw, now);
  const dateInfo = findDate(raw, now);

  let working = raw;
  if (dateInfo) working = working.replace(dateInfo.matched, ' ');
  if (recInfo) working = working.replace(recInfo.matched, ' ');

  const timeInfo = findTime(working, !!(dateInfo && dateInfo.evening));

  const hasTime = !!timeInfo || !!(dateInfo && dateInfo.exact);
  const hasBefore =
    /(之前|以前|截止|ddl|DDL|最后期限|前完成|前搞定|前交)/.test(raw) ||
    /(点|时|号|日|周[一二三四五六日天]|明天|今天|后天|今晚|明晚)\s*前/.test(raw);

  const titleRaw = cleanTitle(raw, [
    dateInfo?.matched,
    timeInfo?.matched,
    recInfo?.matched,
  ]);

  const style = classify({ raw, title: titleRaw, rec: recInfo?.rec, hasTime, hasBefore });

  // 组装截止时间
  let due = null;
  let defaultHour = style === 'habit' ? 9 : style === 'appointment' ? 10 : 20;

  if (dateInfo) {
    due = new Date(dateInfo.date);
    if (dateInfo.evening) defaultHour = 20;
    if (dateInfo.morning) defaultHour = 8;
  }
  if (timeInfo) {
    if (!due) {
      due = new Date(now);
      if (timeInfo.hour < now.getHours() || (timeInfo.hour === now.getHours() && timeInfo.minute <= now.getMinutes())) {
        due = addDays(due, 1);
      }
    }
    due.setHours(timeInfo.hour, timeInfo.minute, 0, 0);
  } else if (due) {
    if (!dateInfo?.exact) due.setHours(defaultHour, 0, 0, 0);
  }

  if (recInfo?.rec) {
    if (timeInfo) recInfo.rec.time = `${pad2(timeInfo.hour)}:${pad2(timeInfo.minute)}`;
    else if (dateInfo?.morning) recInfo.rec.time = '08:00';
    else if (dateInfo?.evening) recInfo.rec.time = '20:00';
    else recInfo.rec.time = recInfo.rec.time || '09:00';
    due = nextOccurrence(recInfo.rec, now);
  }

  // 优先级
  let priority = 'normal';
  if (/紧急|重要|必须|尽快|马上|立刻|立即|务必|必须|!!|！！/.test(raw)) priority = 'high';
  else if (/不急|有空|顺便|低优先|optional/i.test(raw)) priority = 'low';
  else if (due && hasBefore && daysApart(due, now) <= 1) priority = 'high';

  const subtasks = breakdownFor(style, titleRaw);
  const totalMinutes = subtasks.reduce((s, x) => s + (x.minutes || 0), 0);

  // 提醒：约会提前 1 小时，其余提前 30 分钟
  let remindAt = null;
  if (due && !recInfo) {
    const lead = style === 'appointment' ? 60 : 30;
    const t = due.getTime() - lead * 60000;
    if (t > now.getTime() + 60000) remindAt = new Date(t);
  }

  const title = titleRaw || raw;
  const signals = [];
  if (dateInfo || timeInfo) signals.push('时间');
  if (recInfo) signals.push('重复');
  if (hasBefore) signals.push('截止');
  if (subtasks.length) signals.push(`拆成 ${subtasks.length} 步`);

  const confidence = Math.round(
    clamp(
      30 +
        (dateInfo ? 25 : 0) +
        (timeInfo ? 20 : 0) +
        (recInfo ? 15 : 0) +
        (subtasks.length ? 10 : 0),
      0,
      99
    )
  );

  return {
    title,
    raw,
    style,
    dueAt: due ? due.toISOString() : null,
    remindAt: remindAt ? remindAt.toISOString() : null,
    recurrence: recInfo ? recInfo.rec : null,
    priority,
    subtasks,
    estimateMinutes: totalMinutes,
    signals,
    confidence,
    notes: '',
  };
}

/* ---------------- 重复任务工具 ---------------- */

export function nextOccurrence(rec, from = new Date()) {
  if (!rec) return null;
  const [h, m] = (rec.time || '09:00').split(':').map(Number);
  const base = startOfDay(from);
  for (let i = 0; i < 400; i++) {
    const d = addDays(base, i);
    d.setHours(h || 0, m || 0, 0, 0);
    if (d.getTime() <= from.getTime()) continue;
    if (rec.type === 'daily') {
      if ((rec.interval || 1) > 1 && i % rec.interval !== 0) continue;
      return d;
    }
    if (rec.type === 'weekly') {
      const wd = d.getDay() === 0 ? 7 : d.getDay();
      if (!(rec.weekdays || []).includes(wd)) continue;
      return d;
    }
    if (rec.type === 'monthly') {
      if (d.getDate() !== (rec.day || 1)) continue;
      return d;
    }
    return d;
  }
  return null;
}

export function habitDoneOn(task, date = new Date()) {
  return !!(task.habit && task.habit.log && task.habit.log[dayKey(date)]);
}

export function habitStreak(task, now = new Date()) {
  if (!task.habit || !task.habit.log) return 0;
  let streak = 0;
  let cursor = new Date(now);
  if (!habitDoneOn(task, cursor)) cursor = addDays(cursor, -1);
  for (let i = 0; i < 366; i++) {
    if (habitDoneOn(task, cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

/** 习惯最近 7 天打卡情况（旧 → 新） */
export function habitWeek(task, now = new Date()) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(now, -i);
    out.push({ date: d, done: habitDoneOn(task, d), key: dayKey(d) });
  }
  return out;
}

export function recurrenceLabel(rec) {
  if (!rec) return '';
  const time = rec.time || '09:00';
  if (rec.type === 'daily') return rec.interval > 1 ? `每 ${rec.interval} 天 ${time}` : `每天 ${time}`;
  if (rec.type === 'weekly') {
    if (rec.times) return `每周 ${rec.times} 次`;
    const names = ['', '一', '二', '三', '四', '五', '六', '日'];
    return `每周${rec.weekdays.map((d) => names[d]).join('、')} ${time}`;
  }
  if (rec.type === 'monthly') return `每月 ${rec.day} 号 ${time}`;
  return '';
}
