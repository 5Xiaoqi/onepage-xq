/* 一页 · 时段建议
 * 规则来源：Obsidian `90-输出/一天怎么排-时段与任务类型对照.md`
 * 只做"显示建议"，不改任何数据结构；算不出来就给一条兜底建议。
 *
 * 判断顺序（很重要，别乱）：
 *   约会 → 等待 → 机械活 → 已有重复时间 → 关键词 → 习惯默认时间 → 下一步用时 → 截止倒排 → 兜底
 */

/** 机械活：动手不动脑，别占好时段 */
const MECH = /(报销|填表|表格|扫描|归档|打印|盖章|交材料|提交材料|走流程|签字|复印)/;

/** 标题里是否写了具体钟点（不是“早上/下午”这种模糊时段） */
const CLOCK = /(\d{1,2}\s*[点时:：]|[一二三四五六七八九十]{1,3}\s*点)/;

/** 按标题关键词分流 */
export const SLOT_RULES = [
  { re: /(背单词|背课文|背书|背诵|背公式|单词|词汇|早读|朗读)/, slot: '早上 06:40–07:10', why: '起床后最清醒；记忆型不需要连续深度' },
  { re: /(数学|电路|真题|模拟|卷子|推导|计算题)/, slot: '晚上 19:30–21:30', why: '连续攻坚，拆成 20 分钟一段' },
  { re: /(睡前|复盘|对账|日记|回顾|总结今天)/, slot: '21:30–22:00', why: '睡前过一遍，睡着后优先回放' },
  { re: /(站桩|运动|拳|跑步|散步|锻炼|拉伸)/, slot: '傍晚 16:30–17:30', why: '傍晚运动，留时间让体温回落' },
];

/**
 * 给一条任务算"建议时段"。
 * @param {object} task 一页的任务对象（用到 title / style / subtasks / estimateMinutes / recurrence / dueAt）
 * @param {Date} [now] 现在（测试用）
 * @returns {{slot:string, why:string}|null} 约会类返回 null（它自带确定时间）
 */
export function slotHint(task, now = new Date()) {
  if (!task || typeof task !== 'object') return null;

  const title = String(task.title || '');

  // 1. 约会：自己有确切时间，不需要再建议
  if (task.style === 'appointment') return null;

  // 2. 等待：卡在别人身上 → 固定跟进时段
  if (task.style === 'waiting') {
    return { slot: '16:30–17:30 跟进', why: '对方在线、你情绪也稳，别在深夜发' };
  }

  // 3. 机械活：动手不动脑，塞低谷
  if (MECH.test(title)) {
    return { slot: '午后 13:00–14:00 或碎片', why: '机械活，别占好时段' };
  }

  // 4. 已经是重复任务（有固定时间）→ 尊重已定的时间，别和它打架
  //    timeInferred=true 表示解析器给的默认 09:00，并不是用户写的；这种情况继续看关键词
  const rec = task.recurrence || {};
  const recTime = rec.time;
  const recIsExplicit =
    rec.timeInferred === false ||
    (rec.timeInferred === undefined && (CLOCK.test(title) || (recTime && recTime !== '09:00')));
  if (task.style === 'habit' && recTime && recIsExplicit) {
    return { slot: `按已定时间 ${recTime}`, why: '重复任务到点就做，不要每天重新决定' };
  }

  // 5. 关键词
  for (const rule of SLOT_RULES) {
    if (rule.re.test(title)) return { slot: rule.slot, why: rule.why };
  }

  // 5.5 没写具体时间的重复任务：关键词也救不了，就按默认时间，别假装是用户定的
  if (task.style === 'habit' && recTime) {
    return { slot: `按默认时间 ${recTime}`, why: '没写具体时间，先按默认；可在任务里改' };
  }

  // 6. 按下一步用时
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const next = subs.find((s) => s && !s.done);
  const minutes = Number(next && next.minutes) || Number(task.estimateMinutes) || 0;

  if (minutes >= 40) {
    return { slot: '周末 09:00–11:30，或晚上第 1–2 段', why: `下一步约 ${minutes} 分钟，需要连续块` };
  }
  if (minutes >= 20) {
    return { slot: '晚上 19:30–21:30，一段 20 分钟', why: `下一步约 ${minutes} 分钟` };
  }
  if (minutes > 0) {
    return { slot: '午后 13:00–14:00 或碎片', why: `下一步约 ${minutes} 分钟，短闭环` };
  }

  // 7. 有截止但没拆步骤 → 倒排
  const dueMs = task.dueAt ? new Date(task.dueAt).getTime() : NaN;
  if (task.style === 'deadline' && Number.isFinite(dueMs)) {
    const days = Math.ceil((dueMs - now.getTime()) / 86400000);
    if (days <= 0) {
      return { slot: '现在就先做 20 分钟', why: '已经到截止日，先动起来再说' };
    }
    return { slot: '今晚 19:30–21:30 起，20 分钟一段', why: `截止还有 ${days} 天，先动起来再说` };
  }

  // 8. 兜底
  return { slot: '随手做，但别放在 22:00 后', why: '还没拆步骤，先做 5 分钟试试' };
}
