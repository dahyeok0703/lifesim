// 게임 규칙 엔진 = "판정관". 돈/시간/확률/상태 변경은 전부 여기서 결정론적으로.
import { clamp, rand, pick, uid, deepClone, getPath } from "./util.js";
import { baseState, applyDeltas, netWorth, totalCash, monthlyFixedTotal, labelOf, LOWER_IS_BETTER } from "./state.js";
import { SLOTS, advanceSlots, sleep as doSleepTime, dateStr, dateKo, weekday, daysInMonth } from "./time.js";
import {
  DIFFICULTIES, SCENARIOS, HOUSING, LOCATIONS, ITEM_DEFS, GOAL_DEFS, EVENTS,
  ACTION_MAP, NPC_ROLES, NPC_NAMES_M, NPC_NAMES_F, NPC_SURNAMES, hasItem, hasMonthlyItem,
} from "./content.js";

const TIERS = ["대성공", "성공", "부분 성공", "실패", "큰 실패"];

/* ---------------- 캐릭터/세계 생성 ---------------- */
export function createGame(opts = {}) {
  const s = baseState();
  const diff = DIFFICULTIES[opts.difficulty] || DIFFICULTIES["보통"];
  const sc = SCENARIOS[opts.scenario] || null;

  s.difficulty = diff.id;
  s.scenario = opts.scenario || "직접 설정";
  s.character.name = (opts.name || "").trim() || "이서준";
  s.character.age = Number(opts.age) || 22;
  s.character.gender = opts.gender || "남성";
  s.character.region = opts.region || "서울";
  s.character.personality = opts.personality || "평범함";
  s.character.background = opts.background || "";

  if (sc) {
    s.character.job = sc.job; s.character.jobType = sc.jobType; s.character.education = sc.education;
    s.housing.type = sc.housing;
    s.money.cash = Math.round((sc.cash ?? s.money.cash) * diff.moneyMul);
    s.money.bank = Math.round((sc.bank ?? s.money.bank) * diff.moneyMul);
    s.money.debt = sc.debt || 0;
    s.money.monthlyIncome = sc.income || 0;
    s.goalTitle = opts.goal || sc.goal;
    Object.assign(s.skills, sc.skills || {});
    Object.assign(s.mind, sc.mind || {});
    Object.assign(s.social, sc.social || {});
    if (sc.followers) s.sns.followers = sc.followers;
    for (const it of sc.items || []) addItem(s, it);
  } else {
    s.character.education = opts.education || s.character.education;
    s.character.jobType = opts.jobType || "무직";
    s.character.job = opts.jobType && opts.jobType !== "무직" ? opts.job || opts.jobType : "무직";
    s.money.cash = Math.round((Number(opts.startMoney) || 1000000) * 0.2 * diff.moneyMul);
    s.money.bank = Math.round((Number(opts.startMoney) || 1000000) * 0.8 * diff.moneyMul);
    s.goalTitle = opts.goal || "돈 모으기";
  }

  // 주거에 따른 고정비 동기화
  const h = HOUSING[s.housing.type] || HOUSING["원룸"];
  s.money.fixed.rent = h.rent;
  s.money.fixed.maintenance = h.maintenance;

  // 기본 소지품
  if (!hasItem(s, "스마트폰")) addItem(s, "스마트폰");

  // 목표
  if (s.goalTitle && GOAL_DEFS[s.goalTitle]) s.goals = [s.goalTitle];

  // SNS 핸들
  s.sns.handle = "@" + (s.character.name.replace(/\s/g, "") || "me") + rand(10, 99);

  // NPC 생성
  s.npcs = genNpcs(s);

  s.handle = s.sns.handle;
  s.monthStart = { cashbank: totalCash(s), day: 1, snap: snapshot(s) };
  s.weekStart = { snap: snapshot(s), day: s.time.day };
  s.dayStart = { snap: snapshot(s) };
  return s;
}

function genNpcs(s) {
  return NPC_ROLES.map((r) => {
    const g = r.romance ? (s.character.gender === "남성" ? "여성" : "남성") : pick(["남성", "여성"]);
    const name = pick(NPC_SURNAMES) + pick(g === "여성" ? NPC_NAMES_F : NPC_NAMES_M);
    return {
      id: uid(), name, gender: g, age: clamp(s.character.age + rand(-6, 10), 16, 75),
      relation: r.relation, role: r.role, personality: r.personality,
      job: r.relation === "가족" ? "—" : pick(["회사원", "학생", "자영업", "프리랜서", "알바"]),
      affinity: r.affinity, trust: r.trust, intimacy: r.intimacy, suspicion: r.suspicion || 10,
      contactFreq: r.contactFreq, romance: !!r.romance,
      emotion: "중립", hiddenWorry: pick(["요즘 돈 걱정이 있다", "진로가 불안하다", "건강이 안 좋다", "외롭다", "특별한 고민은 없어 보인다"]),
      lastContactDate: dateStr(s.time), memories: [],
    };
  });
}

/* ---------------- 아이템 ---------------- */
export function addItem(s, name) {
  const def = ITEM_DEFS[name];
  s.inventory.push({ id: uid(), name, note: def?.note || "", durability: def?.durability ?? 80, monthly: !!def?.monthly, monthLeft: def?.monthly ? 1 : 0 });
}

/* ---------------- 돈 처리 ---------------- */
function charge(s, amount) {
  // 현금 → 통장 → 부채 순서로 지불
  let left = amount;
  const fromCash = Math.min(s.money.cash, left); s.money.cash -= fromCash; left -= fromCash;
  if (left > 0) { const fromBank = Math.min(s.money.bank, left); s.money.bank -= fromBank; left -= fromBank; }
  if (left > 0) { s.money.debt += left; } // 결국 빚
  s.money.variableThisMonth += amount;
}
function earn(s, amount) { s.money.cash += amount; }

/* ---------------- 판정 ---------------- */
export function judge(p, luck = 0) {
  const r = Math.random();
  const pp = clamp(p + luck, 0.03, 0.97);
  if (r < pp * 0.12) return { tier: "대성공", mult: 1.6 };
  if (r < pp) return { tier: "성공", mult: 1.0 };
  if (r < pp + (1 - pp) * 0.45) return { tier: "부분 성공", mult: 0.5 };
  if (r < pp + (1 - pp) * 0.85) return { tier: "실패", mult: 0 };
  return { tier: "큰 실패", mult: -0.25 };
}

/* ---------------- 행동 미리보기/가능여부 ---------------- */
export function canDo(s, actionId, opts = {}) {
  const a = ACTION_MAP[actionId];
  if (!a) return { ok: false, reason: "알 수 없는 행동" };
  if (!s.alive) return { ok: false, reason: "게임 종료" };
  if (a.special !== "sleep" && s.time.slot >= SLOTS.length) return { ok: false, reason: "오늘 더 이상 활동할 수 없다. 자야 한다." };
  const req = a.requires?.(s);
  if (req) return { ok: false, reason: req };
  if (a.needsNpc && !opts.npcId) return { ok: false, reason: "대상을 선택하세요" };
  const cost = (a.moneyCost?.(s) || 0) + (LOCATIONS[s.location]?.cost || 0);
  if (cost > 0 && totalCash(s) < cost) return { ok: false, reason: "돈이 부족하다" };
  return { ok: true };
}

/* ---------------- 핵심: 행동 실행 ---------------- */
export function act(s, actionId, opts = {}) {
  const a = ACTION_MAP[actionId];
  const check = canDo(s, actionId, opts);
  if (!check.ok) return { blocked: true, reason: check.reason };

  s.dayStart = s.dayStart || { snap: snapshot(s) };

  if (a.special === "sleep") return doSleep(s);
  if (a.special === "bank") return doBank(s);

  const before = snapshot(s);
  const diff = DIFFICULTIES[s.difficulty] || DIFFICULTIES["보통"];

  // 비용
  const venueCost = LOCATIONS[s.location]?.cost || 0;
  const spend = (a.moneyCost?.(s) || 0) + venueCost;
  if (spend > 0) charge(s, spend);

  // 판정
  const p = a.chanceOf ? a.chanceOf(s) : 1;
  const { tier, mult } = judge(p, diff.luck);

  // 효과
  const deltas = { ...(a.fixed ? a.fixed(s) : {}) };
  const locMul = a.locBonus ? a.locBonus(s) : 1;
  if (a.reward) {
    const rw = a.reward(s);
    for (const [k, v] of Object.entries(rw)) {
      deltas[k] = (deltas[k] || 0) + Math.round(v * Math.max(mult, 0) * (a.id === "study" ? locMul : 1));
    }
  }
  // 큰 실패 추가 패널티
  if (tier === "큰 실패") { deltas["mind.stress"] = (deltas["mind.stress"] || 0) + 6; deltas["mind.selfEsteem"] = (deltas["mind.selfEsteem"] || 0) - 3; }

  // 돈 보상
  let earned = 0;
  if (a.moneyReward) { earned = Math.round((a.moneyReward(s) || 0) * Math.max(mult, 0) * diff.moneyMul); if (earned) earn(s, earned); }

  const applied = applyDeltas(s, deltas);

  // SNS 특수
  let snsInfo = null;
  if (a.special === "sns") snsInfo = resolveSns(s, tier);

  // 성공/실패 훅
  if (["대성공", "성공", "부분 성공"].includes(tier)) a.onSuccess?.(s);
  else a.onFail?.(s);

  // NPC 관계 반영
  const npcChanges = applyNpcForAction(s, a, opts, tier);

  // 시간 진행
  const { dayRolled } = advanceSlots(s, a.slots || 1);

  // 취업 플래그 처리
  const jobMsg = processJobFlags(s);

  // 로그
  const moneyStr = (spend ? `현금/통장 -${spend.toLocaleString()}원 ` : "") + (earned ? `+${earned.toLocaleString()}원` : "");
  const logText = `${a.label}${opts.npcName ? ` (${opts.npcName})` : ""} — ${tier}${moneyStr ? ` · ${moneyStr.trim()}` : ""}`;
  pushLog(s, "행동", logText, applied);

  // 행동 후 이벤트 굴림
  const events = [];
  const ev = maybeEvent(s, diff);
  if (ev) events.push(ev);

  // 일/주/월 정산
  const settlements = runSettlements(s, dayRolled);

  checkDeath(s);

  return {
    blocked: false, action: a, tier, mult, applied, earned, spend,
    sns: snsInfo, npcChanges, jobMsg, events, settlements, before,
    logText,
  };
}

function resolveSns(s, tier) {
  s.sns.posts += 1;
  let fd = 0, note = "";
  const base = 1 + s.skills.creativity / 50 + s.social.fame / 60;
  if (tier === "대성공") { fd = rand(600, 2200); note = "게시물이 터졌다(바이럴)!"; s.social.fame = clamp(s.social.fame + 6, 0, 100); }
  else if (tier === "성공") { fd = Math.round(rand(40, 130) * base); note = "반응이 좋다."; }
  else if (tier === "부분 성공") { fd = Math.round(rand(5, 40) * base); note = "잔잔한 반응."; }
  else if (tier === "실패") { fd = rand(-15, 10); note = "별 반응이 없다."; }
  else { fd = -rand(30, 120); note = "악플이 달렸다."; applyDeltas(s, { "mind.mental": -6, "mind.stress": 8, "social.snsImage": -5 }); }
  s.sns.followers = Math.max(0, s.sns.followers + fd);
  s.sns.recent.unshift({ date: dateStr(s.time), text: note, fd });
  if (s.sns.recent.length > 8) s.sns.recent.pop();
  return { followerDelta: fd, note };
}

function applyNpcForAction(s, a, opts, tier) {
  const changes = [];
  const tierAff = { "대성공": 12, "성공": 8, "부분 성공": 4, "실패": -1, "큰 실패": -5 }[tier] ?? 0;
  const targetNpc = opts.npcId ? s.npcs.find((n) => n.id === opts.npcId)
    : a.npcRelation ? pick(s.npcs.filter((n) => n.relation === a.npcRelation))
    : a.npcContact ? s.npcs.find((n) => n.role === a.npcContact) : null;
  if (targetNpc) {
    const d = a.needsNpc ? tierAff : Math.round(tierAff / 2);
    targetNpc.affinity = clamp(targetNpc.affinity + d, 0, 100);
    targetNpc.intimacy = clamp(targetNpc.intimacy + Math.round(d / 2), 0, 100);
    if (d < 0) targetNpc.suspicion = clamp(targetNpc.suspicion + 3, 0, 100);
    targetNpc.lastContactDate = dateStr(s.time);
    remember(s, targetNpc, d >= 0 ? `${a.label}을(를) 함께함 (호감 ${d >= 0 ? "+" : ""}${d})` : `${a.label} 중 분위기가 안 좋았다`, d);
    changes.push({ name: targetNpc.name, affinity: d });
  }
  return changes;
}

function processJobFlags(s) {
  if (s.flags.gotJob) {
    s.flags.gotJob = false;
    s.character.job = "사무직 신입"; s.character.jobType = "정규직";
    s.money.monthlyIncome = 2300000;
    s.character.lifeStage = "직장인";
    pushLog(s, "직업", "면접 합격! 정규직으로 취업했다. (월급 230만원, 월말 입금)");
    return "🎉 면접에 합격해 정규직으로 취업했다!";
  }
  return null;
}

/* ---------------- 수면 ---------------- */
function doSleep(s) {
  const h = HOUSING[s.housing.type] || HOUSING["원룸"];
  const bedMul = hasItem(s, "좋은 침대") ? 1.2 : 1;
  const q = (h.sleepQuality || 1) * bedMul;
  const before = snapshot(s);
  // 밤늦게까지 안 잤으면 밤샘 카운트
  if (s.time.slot >= 5) s.counters.allNighters += 1; else s.counters.allNighters = 0;
  doSleepTime(s);
  const recover = {
    "body.fatigue": -Math.round(55 * q),
    "body.sleepDebt": -Math.round(40 * q),
    "body.stamina": Math.round(25 * q),
    "mind.mental": Math.round(8 * q),
    "mind.stress": -Math.round(6 * q),
    "mind.focus": Math.round(10 * q),
  };
  if (s.counters.allNighters >= 3) { recover["body.health"] = -8; recover["mind.focus"] = -10; }
  const applied = applyDeltas(s, recover);
  pushLog(s, "행동", `수면 — ${s.housing.type} (회복)`, applied);

  const jobMsg = null;
  const settlements = runSettlements(s, true);
  checkDeath(s);
  return { blocked: false, action: ACTION_MAP["sleep"], tier: "수면", applied, settlements, before, logText: "수면", sleep: true };
}

function doBank(s) {
  const before = snapshot(s);
  const dep = Math.max(0, s.money.cash - 50000);
  s.money.cash -= dep; s.money.bank += dep;
  advanceSlots(s, 1);
  pushLog(s, "돈", `은행: ${dep.toLocaleString()}원 저축`, {});
  return { blocked: false, action: ACTION_MAP["bank"], tier: "성공", applied: {}, deposited: dep, before, logText: `저축 ${dep.toLocaleString()}원` };
}

/* ---------------- 이동 ---------------- */
export function move(s, loc) {
  if (!LOCATIONS[loc]) return { blocked: true, reason: "알 수 없는 장소" };
  if (loc === s.location) return { blocked: true, reason: "이미 그곳에 있다" };
  const fare = LOCATIONS[loc].move || 0;
  if (fare > 0 && totalCash(s) < fare) return { blocked: true, reason: "교통비가 부족하다" };
  if (fare > 0) charge(s, fare);
  applyDeltas(s, { "body.fatigue": 2 });
  s.location = loc;
  pushLog(s, "행동", `${loc}(으)로 이동 (교통비 ${fare.toLocaleString()}원)`, {});
  return { blocked: false, moved: true, loc, fare };
}

/* ---------------- 이벤트 ---------------- */
function maybeEvent(s, diff) {
  const cands = EVENTS.filter((e) => e.cond(s));
  for (const e of cands) {
    const p = e.prob(s) + (e.id === "viral_chance" || e.id === "gig" ? diff.luck : -diff.luck * 0.3);
    if (Math.random() < clamp(p, 0, 0.95)) {
      const out = e.apply(s) || {};
      if (out.deltas) applyDeltas(s, out.deltas);
      if (out.sns) s.sns.followers = Math.max(0, s.sns.followers + (out.sns.followers || 0));
      if (out.flag) s.flags[out.flag] = true;
      if (out.set) Object.assign(s.flags, out.set);
      if (out.npcDelta) { const n = s.npcs.find((x) => x.role === out.npcDelta.role); if (n) { n.trust = clamp(n.trust + (out.npcDelta.trust || 0), 0, 100); remember(s, n, "사건: 신뢰 변화", out.npcDelta.trust || 0); } }
      pushLog(s, "사건", `랜덤 사건: ${out.text}`, out.deltas || {});
      return { id: e.id, text: out.text, choices: out.choices || null };
    }
  }
  return null;
}

/* ---------------- 정산 (일/주/월) ---------------- */
function runSettlements(s, dayRolled) {
  const out = {};
  if (!dayRolled) return out;

  // 어제 하루 요약
  out.daily = buildDaily(s);
  dailyDrift(s);
  proactiveContacts(s);

  if (s.time._weekRolled) { out.weekly = buildWeekly(s); s.weekStart = { snap: snapshot(s), day: s.time.day }; }
  if (s.time._monthRolled) { out.monthly = monthEnd(s); }

  s.dayStart = { snap: snapshot(s) };
  return out;
}

// 매일 자연 변화: 식사/관계 감쇠/주거 효과
function dailyDrift(s) {
  const h = HOUSING[s.housing.type] || {};
  const d = {};
  // 식사 안 하면 점점 나빠짐
  if (s.body.mealState < 40) { d["body.health"] = -3; d["mind.focus"] = -3; s.counters.mealsSkippedStreak++; }
  else s.counters.mealsSkippedStreak = 0;
  s.body.mealState = clamp(s.body.mealState - 25, 0, 100); // 하루 지나면 배고픔
  s.body.hygiene = clamp(s.body.hygiene - 10, 0, 100);
  if (h.healthDay) d["body.health"] = (d["body.health"] || 0) - h.healthDay;
  if (h.stressDay) d["mind.stress"] = (d["mind.stress"] || 0) + h.stressDay;
  if (h.mentalDay) d["mind.mental"] = (d["mind.mental"] || 0) + h.mentalDay;
  // 피로/스트레스 높으면 건강 잠식
  if (s.body.fatigue > 85) d["body.health"] = (d["body.health"] || 0) - 2;
  if (s.mind.stress > 85) d["mind.mental"] = (d["mind.mental"] || 0) - 3;
  applyDeltas(s, d);

  // 관계 감쇠: 오래 연락 안 하면
  for (const n of s.npcs) {
    const ds = daysSince(s.time, n.lastContactDate);
    const threshold = n.romance ? 2 : n.relation === "친구" ? 5 : 8;
    if (ds > threshold) {
      const dec = n.romance ? -3 : -1;
      n.affinity = clamp(n.affinity + dec, 0, 100);
      if (ds === threshold + 1) remember(s, n, "한동안 연락이 없었다 (서운함)", dec);
    }
  }
}

function proactiveContacts(s) {
  // 하루 최대 1건, NPC가 먼저 연락
  const ranked = s.npcs
    .map((n) => ({ n, ds: daysSince(s.time, n.lastContactDate) }))
    .filter((x) => x.ds >= 2)
    .sort((a, b) => b.ds - a.ds);
  if (!ranked.length) return;
  const freqP = { 잦음: 0.5, 보통: 0.3, 드묾: 0.15 };
  const top = ranked[0];
  if (Math.random() < (freqP[top.n.contactFreq] || 0.2)) {
    const n = top.n;
    const msg = proactiveMessage(s, n);
    s.incoming = { npcId: n.id, name: n.name, role: n.role, text: msg };
    pushChat(s, "npc", `${n.name}(${n.role}): ${msg}`);
    pushLog(s, "관계", `${n.name}에게서 연락이 왔다`, {});
  }
}

function proactiveMessage(s, n) {
  const neg = n.memories.find((m) => m.delta < 0);
  if (n.romance && daysSince(s.time, n.lastContactDate) > 3) return "요즘 연락이 뜸하네… 나한테 관심 없어진 거야?";
  if (n.relation === "가족") return "밥은 잘 챙겨 먹고 다니니? 건강 잘 챙겨라.";
  if (neg && Math.random() < 0.5) return "지난번 일… 솔직히 좀 서운했어. 잘 지내?";
  return pick(["오랜만이다! 시간 되면 한잔할래?", "잘 지내? 갑자기 생각나서 연락했어.", "요즘 뭐하고 지내?"]);
}

function buildDaily(s) {
  const today = dateStr(prevDay(s.time));
  const logs = s.logs.filter((l) => l.date === today);
  const snap = s.dayStart?.snap || snapshot(s);
  return {
    title: `${today} 하루 요약`,
    income: sumMoneyLogs(logs, true),
    spend: s.money.variableThisMonth, // 누적이라 참고용
    changes: diffSnap(snap, snapshot(s)),
    events: logs.filter((l) => l.type === "사건").map((l) => l.text),
    acted: logs.filter((l) => l.type === "행동").map((l) => l.text),
    risk: dayRiskNote(s),
  };
}
function buildWeekly(s) {
  const snap = s.weekStart?.snap || snapshot(s);
  return { title: "주간 평가", changes: diffSnap(snap, snapshot(s)), advice: weeklyAdvice(s) };
}

function monthEnd(s) {
  const income = s.money.monthlyIncome || 0;
  if (income > 0) s.money.bank += income;
  const fixed = monthlyFixedTotal(s);
  const beforeDebt = s.money.debt;
  charge(s, fixed);
  // 신용점수
  if (s.money.debt > beforeDebt) s.money.creditScore = clamp(s.money.creditScore - 15, 0, 1000);
  else s.money.creditScore = clamp(s.money.creditScore + 5, 0, 1000);
  // 월세 인상 플래그
  if (s.flags.rentUp) { s.money.fixed.rent = Math.round(s.money.fixed.rent * 1.08); s.flags.rentUp = false; }
  // 월 구독 아이템 차감
  for (const it of s.inventory) if (it.monthly && it.monthLeft > 0) it.monthLeft -= 1;

  const snap = s.monthStart?.snap || snapshot(s);
  const summary = {
    title: `${s.time.year}년 ${s.time.month === 1 ? 12 : s.time.month - 1}월 월말 정산`,
    income, fixed, variable: s.money.variableThisMonth,
    net: income - fixed - s.money.variableThisMonth,
    creditScore: s.money.creditScore,
    changes: diffSnap(snap, snapshot(s)),
    risk: monthRiskNote(s), opportunity: monthOppNote(s),
  };
  s.money.variableThisMonth = 0;
  s.monthStart = { cashbank: totalCash(s), day: 1, snap: snapshot(s) };
  pushLog(s, "돈", `월말 정산: 수입 ${income.toLocaleString()} / 고정 ${fixed.toLocaleString()} / 변동 ${summary.variable.toLocaleString()}`, {});
  return summary;
}

/* ---------------- 사망/한계 ---------------- */
function checkDeath(s) {
  if (!s.alive) return;
  if (s.body.health <= 0) { s.alive = false; s.causeOfDeath = "건강 악화로 쓰러짐"; }
  else if (s.mind.mental <= 0) { s.alive = false; s.causeOfDeath = "극심한 정신적 소진"; }
}

/* ---------------- 목표 진행률 ---------------- */
export function goalProgress(s, title = s.goalTitle) {
  const def = GOAL_DEFS[title];
  if (!def) return { progress: 0, reqs: [], obstacles: [] };
  const reqs = def.reqs.map(([path, target, op]) => {
    const cur = getPath(s, path) || 0;
    let ok, ratio;
    if (op === "lte") { ok = cur <= target; ratio = cur <= target ? 1 : clamp(target / Math.max(cur, 1), 0, 1); }
    else { ok = cur >= target; ratio = clamp(cur / target, 0, 1); }
    return { label: labelOf(path), cur, target, op: op || "gte", ok, ratio };
  });
  const progress = Math.round((reqs.reduce((a, r) => a + r.ratio, 0) / reqs.length) * 100);
  const obstacles = [];
  if (s.body.fatigue > 75) obstacles.push("피로도 높음");
  if (s.mind.stress > 75) obstacles.push("스트레스 높음");
  if (totalCash(s) < 200000) obstacles.push("돈 부족");
  if (s.mind.focus < 35) obstacles.push("집중력 낮음");
  return { progress, reqs, obstacles, note: def.note };
}

/* ---------------- 로그/스냅샷/유틸 ---------------- */
export function pushLog(s, type, text, deltas = {}) {
  s.logs.push({ date: dateStr(s.time), slot: SLOTS[s.time.slot] || "심야", type, text, deltas });
  if (s.logs.length > 600) s.logs.shift();
}
export function pushChat(s, role, text) {
  s.chat.push({ role, text, date: `${dateStr(s.time)} ${SLOTS[s.time.slot] || ""}` });
  if (s.chat.length > 80) s.chat.shift();
}
function remember(s, npc, text, delta) {
  npc.memories.unshift({ date: dateStr(s.time), text, delta });
  if (npc.memories.length > 12) npc.memories.pop();
}

function snapshot(s) {
  return {
    cash: s.money.cash, bank: s.money.bank, debt: s.money.debt,
    health: s.body.health, fatigue: s.body.fatigue, stamina: s.body.stamina,
    stress: s.mind.stress, mental: s.mind.mental, motivation: s.mind.motivation,
    study: s.skills.study, work: s.skills.work, coding: s.skills.coding, fitness: s.skills.fitness, creativity: s.skills.creativity,
    reputation: s.social.reputation, followers: s.sns.followers,
  };
}
function diffSnap(a, b) {
  const labels = { cash: "현금", bank: "통장", debt: "부채", health: "건강", fatigue: "피로도", stress: "스트레스", mental: "멘탈", motivation: "동기", study: "학업", work: "업무", coding: "코딩", fitness: "운동", creativity: "창작", reputation: "평판", followers: "팔로워" };
  const out = [];
  for (const k of Object.keys(labels)) {
    const d = (b[k] || 0) - (a[k] || 0);
    if (d !== 0) out.push({ key: k, label: labels[k], delta: d, money: ["cash", "bank", "debt"].includes(k) });
  }
  return out;
}
function sumMoneyLogs() { return 0; }

function dayRiskNote(s) {
  const r = [];
  if (s.body.fatigue > 80) r.push("피로 누적 — 실수/지각 위험");
  if (s.mind.stress > 80) r.push("스트레스 — 충동소비/말실수 위험");
  if (s.body.health < 50) r.push("건강 저하 — 질병 위험");
  if (totalCash(s) < 100000) r.push("현금 부족");
  return r.length ? r : ["특별한 위험 없음"];
}
function weeklyAdvice(s) {
  if (s.mind.stress > 70) return "스트레스가 높습니다. 휴식/운동/대화로 멘탈을 관리하세요.";
  if (totalCash(s) < 300000) return "현금이 부족합니다. 알바/부업으로 수입을 확보하세요.";
  if (s.body.fatigue > 70) return "피로가 쌓였습니다. 규칙적인 수면이 필요합니다.";
  return "안정적입니다. 장기 목표에 자원을 집중할 때입니다.";
}
function monthRiskNote(s) {
  const r = [];
  if (s.money.debt > 0) r.push("부채 상환 부담");
  if (totalCash(s) < monthlyFixedTotal(s)) r.push("다음 달 고정비 부족 위험");
  if (s.body.fatigue > 70) r.push("번아웃 위험");
  return r.length ? r : ["큰 위험 없음"];
}
function monthOppNote(s) {
  const r = [];
  if (s.flags.portfolio) r.push("포트폴리오 완성 — 외주/취업 기회");
  if (s.sns.followers > 5000) r.push("SNS 영향력 — 협찬/광고 가능");
  if (s.skills.coding > 55 || s.skills.creativity > 55) r.push("부업 외주 가능");
  return r.length ? r : ["꾸준히 실력을 쌓으세요"];
}

function prevDay(t) {
  const d = new Date(t.year, t.month - 1, t.day);
  d.setDate(d.getDate() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}
function daysSince(t, dateString) {
  if (!dateString) return 0;
  const [y, m, d] = dateString.split("-").map(Number);
  const a = new Date(y, m - 1, d), b = new Date(t.year, t.month - 1, t.day);
  return Math.round((b - a) / 86400000);
}
