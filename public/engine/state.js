// 상태 모델 정의 + 결정론적 수치 적용/클램프. (AI가 절대 건드리지 않는 영역)
import { clamp, getPath, setPath } from "./util.js";

// 0~100으로 묶이는 접두사
const PCT_PREFIX = ["body.", "mind.", "skills.", "social."];
// 특수 범위
const RANGES = {
  "body.weight": [35, 200],
  "money.creditScore": [0, 1000],
};
// 클램프 예외(카운트/금액 등)
const NO_PCT = new Set(["body.weight", "money.creditScore", "social.criminalRecord"]);

export function clampPath(path, val) {
  if (RANGES[path]) return clamp(val, RANGES[path][0], RANGES[path][1]);
  if (path === "social.criminalRecord") return Math.max(0, Math.round(val));
  if (path.startsWith("money.")) return Math.round(val); // 금액은 클램프 없음(음수 가능은 호출부서 관리)
  if (PCT_PREFIX.some((p) => path.startsWith(p)) && !NO_PCT.has(path)) return clamp(Math.round(val), 0, 100);
  return val;
}

// deltas: { "body.fatigue": +30, "money.cash": +60000, ... }
export function applyDeltas(state, deltas = {}) {
  const applied = {};
  for (const [path, d] of Object.entries(deltas)) {
    if (typeof d !== "number" || d === 0) continue;
    const cur = getPath(state, path) || 0;
    const nv = clampPath(path, cur + d);
    setPath(state, path, nv);
    applied[path] = nv - cur; // 실제 반영된 변화량(클램프 후)
  }
  return applied;
}

export const STAT_GROUPS = {
  body: { label: "몸", keys: { stamina: "체력", fatigue: "피로도", sleepDebt: "수면부족", health: "건강", illnessRisk: "질병위험", grooming: "외모관리", hygiene: "청결", mealState: "식사" } },
  mind: { label: "정신", keys: { mental: "멘탈", stress: "스트레스", selfEsteem: "자존감", focus: "집중력", depression: "우울감", motivation: "동기", burnoutRisk: "번아웃" } },
  skills: { label: "능력", keys: { study: "학업", work: "업무", speech: "말솜씨", grooming: "외모관리", fitness: "운동", creativity: "창작", coding: "코딩", business: "사업감각", driving: "운전", cooking: "요리", finance: "재무", social: "인간관계" } },
  social: { label: "사회", keys: { reputation: "평판", trust: "신뢰도", fame: "인지도", snsImage: "SNS이미지", localRep: "지역평판" } },
};

export const LABELS = {
  "body.stamina": "체력", "body.fatigue": "피로도", "body.sleepDebt": "수면부족",
  "body.health": "건강", "body.illnessRisk": "질병위험", "body.grooming": "외모관리",
  "body.weight": "체중", "body.mealState": "식사", "body.hygiene": "청결",
  "mind.mental": "멘탈", "mind.stress": "스트레스", "mind.selfEsteem": "자존감",
  "mind.focus": "집중력", "mind.depression": "우울감", "mind.motivation": "동기", "mind.burnoutRisk": "번아웃",
  "skills.study": "학업", "skills.work": "업무능력", "skills.speech": "말솜씨", "skills.grooming": "외모관리",
  "skills.fitness": "운동능력", "skills.creativity": "창작", "skills.coding": "코딩", "skills.business": "사업감각",
  "skills.driving": "운전", "skills.cooking": "요리", "skills.finance": "재무관리", "skills.social": "인간관계능력",
  "social.reputation": "평판", "social.trust": "신뢰도", "social.fame": "인지도", "social.snsImage": "SNS이미지",
  "money.cash": "현금", "money.bank": "계좌", "money.debt": "부채", "money.creditScore": "신용점수",
  "sns.followers": "팔로워",
};

export function labelOf(path) {
  return LABELS[path] || path;
}

// 좋아지면 좋은 값 / 낮을수록 좋은 값 구분(색상/위험 판단용)
export const LOWER_IS_BETTER = new Set([
  "body.fatigue", "body.sleepDebt", "body.illnessRisk",
  "mind.stress", "mind.depression", "mind.burnoutRisk",
  "money.debt", "social.criminalRecord",
]);

// 기본 상태 골격(시나리오/난이도에서 덮어씀)
export function baseState() {
  return {
    character: { name: "", age: 22, gender: "남성", region: "서울", job: "무직", jobType: "무직", education: "고등학교 졸업", personality: "평범함", background: "", lifeStage: "사회 초년" },
    goalTitle: "",
    goals: [],
    time: { year: 2026, month: 6, day: 1, slot: 0, woke: true },
    location: "집",
    money: {
      cash: 200000, bank: 800000, debt: 0, creditScore: 720, emergency: 0,
      monthlyIncome: 0,
      fixed: { rent: 350000, maintenance: 70000, comm: 55000, subscription: 20000 },
      variableThisMonth: 0,
    },
    body: { stamina: 80, fatigue: 15, sleepDebt: 10, health: 85, illnessRisk: 10, grooming: 50, weight: 65, mealState: 70, hygiene: 75 },
    mind: { mental: 70, stress: 25, selfEsteem: 55, focus: 65, depression: 15, motivation: 60, burnoutRisk: 10 },
    skills: { study: 40, work: 30, speech: 40, grooming: 40, fitness: 40, creativity: 30, coding: 20, business: 20, driving: 20, cooking: 30, finance: 30, social: 45 },
    social: { reputation: 50, trust: 50, fame: 5, snsImage: 50, localRep: 50, criminalRecord: 0 },
    sns: { platform: "인스타그램", handle: "@me", followers: 120, posts: 0, recent: [] },
    housing: { type: "원룸", condition: 60 },
    inventory: [],
    npcs: [],
    logs: [],
    chat: [],
    flags: {},
    counters: { allNighters: 0, mealsSkippedStreak: 0, daysSinceWorkout: 0 },
    history: { daily: [], weekly: [], monthly: [] },
    monthStart: { cashbank: 0, day: 1 },
    alive: true,
    causeOfDeath: null,
  };
}

export function netWorth(s) {
  return s.money.cash + s.money.bank - s.money.debt;
}
export function totalCash(s) {
  return s.money.cash + s.money.bank;
}
export function monthlyFixedTotal(s) {
  const f = s.money.fixed;
  return f.rent + f.maintenance + f.comm + f.subscription;
}
