/* 一页 · 导出 .ics 到 iPhone 日历（带闹钟）
 * 网页 App 关闭时无法自己弹通知，这是最可靠的原生提醒兜底。
 */

import { download, pad2 } from './util.js';

function stamp(d) {
  const x = new Date(d);
  return `${x.getFullYear()}${pad2(x.getMonth() + 1)}${pad2(x.getDate())}T${pad2(x.getHours())}${pad2(x.getMinutes())}00`;
}

function utcStamp(d) {
  const x = new Date(d);
  return (
    `${x.getUTCFullYear()}${pad2(x.getUTCMonth() + 1)}${pad2(x.getUTCDate())}T` +
    `${pad2(x.getUTCHours())}${pad2(x.getUTCMinutes())}${pad2(x.getUTCSeconds())}Z`
  );
}

function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildICS(tasks, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Onepage//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:一页 · 任务提醒',
    'X-WR-TIMEZONE:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'),
  ];

  let count = 0;
  for (const t of tasks) {
    if (!t.dueAt) continue;
    const start = new Date(t.dueAt);
    const end = new Date(start.getTime() + 30 * 60000);
    const subs = (t.subtasks || []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('\n');
    const desc = [t.notes, subs].filter(Boolean).join('\n\n');
    const lead = t.style === 'appointment' ? -60 : -15;

    const block = [
      'BEGIN:VEVENT',
      `UID:${t.id}@onepage.local`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(t.title)}`,
      desc ? `DESCRIPTION:${esc(desc)}` : '',
      'BEGIN:VALARM',
      `TRIGGER:-PT${Math.abs(lead)}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(t.title)}`,
      'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean);
    lines.push(...block);
    count++;
  }

  lines.push('END:VCALENDAR');
  return { ics: lines.join('\r\n'), count };
}

export function exportTasksToCalendar(tasks) {
  const { ics, count } = buildICS(tasks);
  if (!count) return 0;
  const name = `一页提醒-${new Date().getMonth() + 1}月${new Date().getDate()}日.ics`;
  download(name, ics, 'text/calendar;charset=utf-8');
  return count;
}

export function calendarTipHTML() {
  return `<div class="tip-card">导入后，到点由 iPhone 日历响铃，App 关着也会提醒。导入时选择「日历」App 即可。</div>`;
}
