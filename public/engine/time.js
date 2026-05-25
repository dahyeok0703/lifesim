// 시간 시스템: 하루 6시간대, 달력/요일/계절, 시간대 진행, 수면.
export const SLOTS = ["아침", "오전", "오후", "저녁", "밤", "심야"];
export const SLOT_CLOCK = ["07:00", "10:00", "13:00", "18:00", "21:00", "00:30"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function slotName(i) { return SLOTS[i] ?? "심야"; }
export function slotClock(i) { return SLOT_CLOCK[i] ?? "심야"; }
export function slotsLeft(s) { return SLOTS.length - s.time.slot; }

export function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
export function weekday(t) { return WEEKDAYS[new Date(t.year, t.month - 1, t.day).getDay()]; }
export function isWeekend(t) { const d = new Date(t.year, t.month - 1, t.day).getDay(); return d === 0 || d === 6; }
export function daysLeftInMonth(t) { return daysInMonth(t.year, t.month) - t.day; }

export function season(month) {
  if (month >= 3 && month <= 5) return "봄";
  if (month >= 6 && month <= 8) return "여름";
  if (month >= 9 && month <= 11) return "가을";
  return "겨울";
}

export function dateStr(t) {
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}
export function dateKo(t) {
  return `${t.year}년 ${t.month}월 ${t.day}일 (${weekday(t)})`;
}

// 시간대 cnt칸 진행. day가 넘어가면 {dayRolled:true} 반환(상위에서 일/주/월 정산 트리거)
export function advanceSlots(s, n = 1) {
  s.time.slot += n;
  let dayRolled = false;
  while (s.time.slot >= SLOTS.length) {
    s.time.slot -= SLOTS.length;
    rollDay(s);
    dayRolled = true;
  }
  return { dayRolled };
}

// 다음 날 아침으로(수면). 수면 품질에 따라 회복.
export function sleep(s, hours = 7) {
  rollDay(s);
  s.time.slot = 0;
  s.time.woke = true;
  return hours;
}

function rollDay(s) {
  s.time.day += 1;
  const dim = daysInMonth(s.time.year, s.time.month);
  let monthRolled = false;
  if (s.time.day > dim) {
    s.time.day = 1;
    s.time.month += 1;
    if (s.time.month > 12) { s.time.month = 1; s.time.year += 1; }
    monthRolled = true;
  }
  s.time._monthRolled = monthRolled;
  s.time._weekRolled = new Date(s.time.year, s.time.month - 1, s.time.day).getDay() === 1; // 월요일=주 시작
}
