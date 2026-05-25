// 게임 콘텐츠 데이터: 난이도/시나리오/장소/아이템/NPC풀/행동/이벤트/목표
import { clamp } from "./util.js";

/* ---------------- 난이도 ---------------- */
export const DIFFICULTIES = {
  쉬움: { id: "쉬움", moneyMul: 1.6, luck: 0.12, costMul: 0.85, desc: "돈과 체력 여유가 많고 좋은 기회가 자주 온다" },
  보통: { id: "보통", moneyMul: 1.0, luck: 0.0, costMul: 1.0, desc: "현실적인 난이도" },
  어려움: { id: "어려움", moneyMul: 0.7, luck: -0.1, costMul: 1.15, desc: "돈 부족, 피로 누적, 기회 제한" },
  생존: { id: "생존", moneyMul: 0.5, luck: -0.18, costMul: 1.3, desc: "월세·건강·관계·돈 압박이 매우 강함" },
};

/* ---------------- 시나리오 ---------------- */
// 각 시나리오는 baseState를 부분적으로 덮어쓴다.
export const SCENARIOS = {
  "고졸 취준생": { job: "무직", jobType: "취준생", education: "고등학교 졸업", housing: "부모님 집", cash: 150000, bank: 400000, goal: "취업 성공", skills: { work: 25, speech: 35 } },
  "알바생": { job: "편의점 알바", jobType: "알바", education: "고등학교 졸업", housing: "원룸", cash: 250000, bank: 300000, income: 0, goal: "돈 모으기", skills: { work: 40 } },
  "대학생": { job: "대학생", jobType: "학생", education: "대학교 재학", housing: "기숙사", cash: 200000, bank: 600000, goal: "취업 성공", skills: { study: 55 } },
  "신입사원": { job: "사무직 신입", jobType: "정규직", education: "대학교 졸업", housing: "원룸", cash: 400000, bank: 1500000, income: 2300000, goal: "돈 모으기", skills: { work: 50, speech: 45 } },
  "백수": { job: "무직", jobType: "백수", education: "대학교 졸업", housing: "부모님 집", cash: 100000, bank: 200000, goal: "은둔형 외톨이 탈출", mind: { motivation: 40, depression: 30 } },
  "프리랜서 지망생": { job: "무직", jobType: "프리랜서", education: "대학교 졸업", housing: "원룸", cash: 300000, bank: 700000, goal: "프리랜서 자리잡기", skills: { creativity: 45, speech: 45 } },
  "게임 개발자 지망생": { job: "무직", jobType: "지망생", education: "대학교 졸업", housing: "원룸", cash: 250000, bank: 500000, goal: "게임 개발자 되기", skills: { coding: 45, creativity: 40 }, items: ["노트북"] },
  "유튜버 지망생": { job: "무직", jobType: "지망생", education: "고등학교 졸업", housing: "원룸", cash: 200000, bank: 300000, goal: "유튜버 성장", skills: { creativity: 50, speech: 45 }, items: ["카메라"], followers: 300 },
  "창업 준비생": { job: "무직", jobType: "지망생", education: "대학교 졸업", housing: "원룸", cash: 500000, bank: 3000000, goal: "창업 성공", skills: { business: 45, finance: 40 } },
  "빚을 가진 청년": { job: "계약직", jobType: "계약직", education: "고등학교 졸업", housing: "고시원", cash: 80000, bank: 100000, debt: 8000000, income: 1700000, goal: "빚 청산", mind: { stress: 50 } },
  "지방에서 상경한 사람": { job: "무직", jobType: "취준생", education: "대학교 졸업", housing: "반지하", region: "서울", cash: 200000, bank: 500000, goal: "서울 정착", mind: { stress: 35 } },
  "은둔에서 벗어나려는 사람": { job: "무직", jobType: "백수", education: "고등학교 졸업", housing: "부모님 집", cash: 50000, bank: 150000, goal: "은둔형 외톨이 탈출", mind: { motivation: 25, depression: 45, selfEsteem: 30 }, social: { social: 25 } },
};

/* ---------------- 주거 ---------------- */
export const HOUSING = {
  "부모님 집": { rent: 0, maintenance: 30000, sleepQuality: 1.0, note: "월세 부담 없음 / 독립성 낮음" },
  "고시원": { rent: 350000, maintenance: 0, sleepQuality: 0.7, stressDay: 1, note: "월세 낮음 / 수면 질 낮음" },
  "반지하": { rent: 400000, maintenance: 50000, sleepQuality: 0.85, healthDay: 1, note: "월세 낮음 / 건강 위험" },
  "원룸": { rent: 550000, maintenance: 70000, sleepQuality: 1.0, note: "기본 독립생활" },
  "오피스텔": { rent: 850000, maintenance: 120000, sleepQuality: 1.15, mentalDay: 1, note: "멘탈 회복↑ / 월세 부담 큼" },
  "기숙사": { rent: 250000, maintenance: 30000, sleepQuality: 0.95, note: "저렴 / 통제 많음" },
};

/* ---------------- 장소 ---------------- */
export const LOCATIONS = {
  "집": { actions: ["rest", "sleep", "eat", "study", "create", "coding", "sns", "talk_family"], move: 0 },
  "편의점": { actions: ["parttime", "shopping", "eat"], move: 2000 },
  "PC방": { actions: ["coding", "create", "sns", "rest"], move: 3000 },
  "헬스장": { actions: ["workout"], move: 2000 },
  "회사": { actions: ["work"], move: 1500 },
  "도서관": { actions: ["study", "create"], move: 1000, studyBonus: 1.3 },
  "스터디카페": { actions: ["study", "coding", "create"], move: 1500, studyBonus: 1.25, cost: 4000 },
  "카페": { actions: ["rest", "study", "talk_friend", "create"], move: 2000, cost: 5500 },
  "병원": { actions: ["hospital"], move: 4000 },
  "은행": { actions: ["bank"], move: 1500 },
  "공원": { actions: ["walk", "workout"], move: 1000 },
  "면접장": { actions: ["interview"], move: 3000 },
  "술집": { actions: ["drink"], move: 3000 },
  "마트": { actions: ["shopping"], move: 2500 },
};

/* ---------------- 아이템 ---------------- */
export const ITEM_DEFS = {
  "스마트폰": { effects: {}, note: "필수품", durability: 70 },
  "노트북": { effects: { coding: 1.3, creativity: 1.2 }, note: "코딩/창작 효율↑", durability: 80 },
  "정장": { effects: { interview: 1.25 }, note: "면접/소개팅 유리", durability: 90 },
  "운동화": { effects: { workout: 1.2 }, note: "운동 효율↑", durability: 80 },
  "책상": { effects: { study: 1.15 }, note: "공부/작업 효율↑", durability: 95 },
  "좋은 침대": { effects: { sleep: 1.2 }, note: "수면 회복↑", durability: 95 },
  "카메라": { effects: { sns: 1.3, create: 1.2 }, note: "콘텐츠 제작↑", durability: 85 },
  "헬스장 이용권": { effects: {}, note: "이번 달 헬스장 무료", durability: 100, monthly: true },
};

/* ---------------- NPC 생성 풀 ---------------- */
export const NPC_NAMES_M = ["민수", "지훈", "현우", "준영", "성민", "태현", "동현", "재민"];
export const NPC_NAMES_F = ["지은", "수빈", "예진", "하늘", "민지", "서영", "유진", "다현"];
export const NPC_SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "한"];

// 시작 시 생성할 NPC 역할 세트
export const NPC_ROLES = [
  { relation: "가족", role: "어머니", affinity: 75, trust: 80, intimacy: 80, personality: "걱정 많은", contactFreq: "잦음" },
  { relation: "친구", role: "절친", affinity: 70, trust: 70, intimacy: 65, personality: "유쾌한", contactFreq: "보통" },
  { relation: "친구", role: "동창", affinity: 55, trust: 55, intimacy: 45, personality: "무던한", contactFreq: "드묾" },
  { relation: "직장/학교", role: "상사/선배", affinity: 50, trust: 50, intimacy: 30, personality: "엄격한", contactFreq: "보통" },
  { relation: "이웃/지인", role: "단골 사장님", affinity: 55, trust: 55, intimacy: 40, personality: "친근한", contactFreq: "드묾" },
  { relation: "잠재적 연애", role: "호감 가는 사람", affinity: 45, trust: 45, intimacy: 30, personality: "조용한", contactFreq: "드묾", romance: true },
  { relation: "불편한 관계", role: "라이벌", affinity: 30, trust: 35, intimacy: 20, suspicion: 40, personality: "경쟁심 강한", contactFreq: "드묾" },
];

/* ---------------- 장기 목표 ---------------- */
// requirements: 진행률 계산용 (path/op/target). progress = 충족 평균.
export const GOAL_DEFS = {
  "취업 성공": { reqs: [["skills.work", 60], ["skills.speech", 50], ["mind.mental", 40]], flag: "employed", note: "면접 합격 시 달성" },
  "게임 개발자 되기": { reqs: [["skills.coding", 70], ["flags.portfolio", 1], ["body.stamina", 40]], note: "포트폴리오 + 코딩 필요" },
  "유튜버 성장": { reqs: [["sns.followers", 10000], ["skills.creativity", 60]], note: "꾸준한 업로드" },
  "돈 모으기": { reqs: [["money.bank", 10000000]], note: "통장 1천만원" },
  "빚 청산": { reqs: [["money.debt", 0, "lte"]], note: "부채 0원" },
  "창업 성공": { reqs: [["money.bank", 5000000], ["skills.business", 50], ["flags.startup", 1]], note: "자본 + 사업감각" },
  "은둔형 외톨이 탈출": { reqs: [["skills.social", 50], ["mind.depression", 20, "lte"], ["mind.selfEsteem", 50]], note: "사람과 어울리기" },
  "건강 회복": { reqs: [["body.health", 80], ["body.fatigue", 25, "lte"], ["mind.stress", 30, "lte"]], note: "몸과 마음 회복" },
  "프리랜서 자리잡기": { reqs: [["skills.creativity", 60], ["social.reputation", 60], ["money.monthlyIncome", 2000000]], note: "평판 + 수입" },
  "서울 정착": { reqs: [["money.bank", 5000000], ["skills.work", 55]], note: "안정적 수입과 저축" },
};

/* ---------------- 행동 카탈로그 ---------------- */
const c01 = (p) => clamp(p, 0.05, 0.95);

export const ACTIONS = [
  {
    id: "rest", label: "휴식", icon: "☕", cat: "생활", slots: 1, special: false,
    fixed: () => ({ "body.fatigue": -22, "mind.stress": -8, "body.stamina": 8 }),
    chanceOf: () => 1, reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["피로도 -22", "스트레스 -8", "체력 +8", "시간 1칸"],
  },
  {
    id: "sleep", label: "수면", icon: "🛏️", cat: "생활", slots: 0, special: "sleep",
    preview: () => ["피로/수면부족 회복", "다음 날 아침으로"],
  },
  {
    id: "eat", label: "식사", icon: "🍚", cat: "생활", slots: 1,
    moneyCost: () => 8000,
    requires: (s) => (s.money.cash + s.money.bank >= 8000 ? null : "돈이 부족하다"),
    fixed: () => ({ "body.mealState": 35, "body.health": 2, "body.fatigue": -4, "mind.stress": -2 }),
    chanceOf: () => 1, reward: () => ({}), moneyReward: () => 0,
    preview: () => ["현금 -8,000원", "식사 +35", "건강 +2", "시간 1칸"],
  },
  {
    id: "study", label: "공부", icon: "📚", cat: "성장", slots: 1,
    fixed: () => ({ "body.fatigue": 12, "mind.stress": 4, "mind.focus": -3 }),
    chanceOf: (s) => c01(0.5 + s.mind.focus / 250 - s.body.fatigue / 250 - s.mind.depression / 300),
    reward: () => ({ "skills.study": 3, "skills.coding": 0, "mind.motivation": 1 }),
    moneyReward: () => 0, moneyCost: () => 0,
    locBonus: (s) => (LOCATIONS[s.location]?.studyBonus || 1),
    preview: () => ["학업 +3 (집중도/장소 영향)", "피로도 +12", "스트레스 +4", "시간 1칸"],
  },
  {
    id: "workout", label: "운동", icon: "💪", cat: "건강", slots: 1,
    moneyCost: (s) => (s.location === "헬스장" && !hasMonthlyItem(s, "헬스장 이용권") ? 12000 : 0),
    fixed: () => ({ "body.fatigue": 12, "mind.stress": -7, "body.stamina": 4 }),
    chanceOf: (s) => c01(0.6 + s.skills.fitness / 300 - s.body.fatigue / 300),
    reward: (s) => ({ "skills.fitness": 2, "body.grooming": 1, "mind.selfEsteem": 1, "body.health": itemMul(s, "운동화", "workout") > 1 ? 2 : 1 }),
    moneyReward: () => 0,
    preview: () => ["운동 +2, 외모관리 +1, 자존감 +1", "피로도 +12", "스트레스 -7", "시간 1칸"],
  },
  {
    id: "parttime", label: "알바", icon: "🏪", cat: "돈", slots: 2,
    fixed: () => ({ "body.fatigue": 32, "mind.stress": 9, "body.stamina": -10 }),
    chanceOf: (s) => c01(0.75 + s.skills.work / 400 - s.body.fatigue / 250),
    reward: () => ({ "skills.work": 1 }),
    moneyReward: () => 60000, moneyCost: () => 0,
    npcContact: "단골 사장님",
    preview: () => ["현금 +60,000원", "업무 +1", "피로도 +32", "스트레스 +9", "시간 2칸"],
  },
  {
    id: "work", label: "출근", icon: "🏢", cat: "돈", slots: 3,
    requires: (s) => (s.character.jobType === "정규직" || s.character.jobType === "계약직" ? null : "정규직/계약직만 출근할 수 있다"),
    fixed: () => ({ "body.fatigue": 28, "mind.stress": 11, "body.stamina": -8 }),
    chanceOf: (s) => c01(0.7 + s.skills.work / 300 - s.body.fatigue / 250),
    reward: () => ({ "skills.work": 2 }),
    moneyReward: () => 0, moneyCost: () => 0,
    npcContact: "상사/선배",
    preview: () => ["업무능력 +2 (월급은 월말 정산)", "피로도 +28", "스트레스 +11", "시간 3칸"],
  },
  {
    id: "jobhunt", label: "구직", icon: "📨", cat: "성장", slots: 1,
    fixed: () => ({ "body.fatigue": 8, "mind.stress": 10, "mind.selfEsteem": -2 }),
    chanceOf: (s) => c01(0.35 + s.skills.work / 350 + s.skills.speech / 400 + s.social.reputation / 500),
    reward: () => ({ "skills.work": 1 }),
    moneyReward: () => 0, moneyCost: () => 0,
    onSuccess: (s) => { s.flags.interviewOffer = true; },
    preview: () => ["성공 시 면접 제안", "피로도 +8", "스트레스 +10", "시간 1칸"],
  },
  {
    id: "interview", label: "면접", icon: "🤝", cat: "성장", slots: 2,
    requires: (s) => (s.flags.interviewOffer ? null : "면접 제안이 없다 (구직 먼저)"),
    fixed: () => ({ "body.fatigue": 14, "mind.stress": 16 }),
    chanceOf: (s) => c01(0.25 + s.skills.speech / 250 + s.skills.work / 300 + s.body.grooming / 500 + (hasItem(s, "정장") ? 0.12 : -0.05) - s.body.fatigue / 400),
    reward: () => ({ "skills.speech": 1 }),
    moneyReward: () => 0, moneyCost: () => 0,
    onSuccess: (s) => { s.flags.gotJob = true; s.flags.interviewOffer = false; },
    onFail: (s) => { s.flags.interviewOffer = false; },
    preview: () => ["합격 시 취업! (정장 보유 유리)", "스트레스 +16", "시간 2칸"],
  },
  {
    id: "coding", label: "코딩", icon: "💻", cat: "성장", slots: 1,
    fixed: () => ({ "body.fatigue": 12, "mind.focus": -4, "mind.stress": 3 }),
    chanceOf: (s) => c01(0.55 + s.skills.coding / 250 - s.body.fatigue / 300),
    reward: (s) => ({ "skills.coding": Math.round(2 * itemMul(s, "노트북", "coding")) || 2 }),
    moneyReward: () => 0, moneyCost: () => 0,
    onSuccess: (s) => { if (s.skills.coding >= 55) s.flags.portfolioProgress = (s.flags.portfolioProgress || 0) + 1; if ((s.flags.portfolioProgress || 0) >= 8) s.flags.portfolio = 1; },
    preview: () => ["코딩 +2 (노트북 보유 시↑)", "피로도 +12", "시간 1칸"],
  },
  {
    id: "create", label: "창작", icon: "🎨", cat: "성장", slots: 1,
    fixed: () => ({ "body.fatigue": 10, "mind.stress": 2, "mind.motivation": 2 }),
    chanceOf: (s) => c01(0.55 + s.skills.creativity / 250 - s.body.fatigue / 300),
    reward: (s) => ({ "skills.creativity": Math.round(2 * itemMul(s, "카메라", "create")) || 2 }),
    moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["창작 +2", "피로도 +10", "동기 +2", "시간 1칸"],
  },
  {
    id: "sidejob", label: "부업", icon: "🧰", cat: "돈", slots: 2,
    requires: (s) => (s.skills.creativity >= 40 || s.skills.coding >= 40 ? null : "부업할 기술이 부족하다 (창작/코딩 40↑)"),
    fixed: () => ({ "body.fatigue": 20, "mind.stress": 7 }),
    chanceOf: (s) => c01(0.4 + Math.max(s.skills.coding, s.skills.creativity) / 250 + s.social.reputation / 500),
    reward: () => ({ "social.reputation": 1 }),
    moneyReward: (s) => 80000 + Math.max(s.skills.coding, s.skills.creativity) * 1500,
    moneyCost: () => 0,
    preview: () => ["성공 시 외주비 (실력 비례)", "피로도 +20", "시간 2칸"],
  },
  {
    id: "sns", label: "SNS", icon: "📱", cat: "사회", slots: 1,
    fixed: () => ({ "mind.stress": 2 }),
    chanceOf: (s) => c01(0.45 + s.skills.creativity / 300 + s.social.fame / 400),
    reward: () => ({ "social.fame": 1 }),
    moneyReward: () => 0, moneyCost: () => 0,
    special: "sns",
    preview: () => ["게시물 업로드 (바이럴 가능)", "팔로워 변동", "시간 1칸"],
  },
  {
    id: "talk", label: "대화", icon: "💬", cat: "관계", slots: 1, needsNpc: true,
    fixed: () => ({ "mind.stress": -6, "skills.social": 1 }),
    chanceOf: (s) => c01(0.6 + s.skills.speech / 300),
    reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["상대 호감/친밀도 +", "스트레스 -6", "인간관계 +1", "시간 1칸"],
  },
  {
    id: "walk", label: "산책", icon: "🌳", cat: "건강", slots: 1,
    fixed: () => ({ "mind.stress": -7, "body.stamina": 3, "mind.depression": -3, "body.fatigue": 3 }),
    chanceOf: () => 1, reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["스트레스 -7", "우울감 -3", "체력 +3", "시간 1칸"],
  },
  {
    id: "shopping", label: "쇼핑", icon: "🛍️", cat: "생활", slots: 1,
    fixed: () => ({ "mind.stress": -5, "body.grooming": 2 }),
    chanceOf: () => 1, reward: () => ({}),
    moneyReward: () => 0, moneyCost: () => 30000,
    requires: (s) => (s.money.cash + s.money.bank >= 30000 ? null : "돈이 부족하다"),
    preview: () => ["현금 -30,000원", "스트레스 -5", "외모관리 +2", "시간 1칸"],
  },
  {
    id: "hospital", label: "병원", icon: "🏥", cat: "건강", slots: 1,
    moneyCost: () => 22000,
    requires: (s) => (s.money.cash + s.money.bank >= 22000 ? null : "병원비가 부족하다"),
    fixed: () => ({ "body.health": 12, "body.illnessRisk": -25, "mind.stress": -3 }),
    chanceOf: () => 1, reward: () => ({}), moneyReward: () => 0,
    onSuccess: (s) => { s.flags.sick = false; },
    preview: () => ["현금 -22,000원", "건강 +12", "질병위험 -25", "시간 1칸"],
  },
  {
    id: "drink", label: "술자리", icon: "🍻", cat: "관계", slots: 2, needsNpc: true,
    moneyCost: () => 35000,
    requires: (s) => (s.money.cash + s.money.bank >= 35000 ? null : "돈이 부족하다"),
    fixed: () => ({ "mind.stress": -12, "body.fatigue": 18, "body.health": -4 }),
    chanceOf: (s) => c01(0.7 - s.mind.stress / 300),
    reward: () => ({}), moneyReward: () => 0,
    preview: () => ["현금 -35,000원", "스트레스 -12", "다음날 피로", "관계 +", "시간 2칸"],
  },
  {
    id: "talk_family", label: "가족과 대화", icon: "👨‍👩‍👧", cat: "관계", slots: 1, npcRelation: "가족",
    fixed: () => ({ "mind.stress": -5, "mind.mental": 3 }),
    chanceOf: () => 0.8, reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["멘탈 +3", "가족 관계 변화", "시간 1칸"],
  },
  {
    id: "bank", label: "은행 업무", icon: "🏦", cat: "돈", slots: 1, special: "bank",
    fixed: () => ({}), chanceOf: () => 1, reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["저축/예금 이체", "시간 1칸"],
  },
  {
    // 자유 입력 전용 (키워드로 매칭되는 행동이 없을 때). 효과는 보수적으로.
    id: "freeform", label: "자유 행동", icon: "✍️", cat: "기타", slots: 1, freeform: true,
    fixed: () => ({ "body.fatigue": 5, "mind.stress": 1 }),
    chanceOf: () => 0.85, reward: () => ({}), moneyReward: () => 0, moneyCost: () => 0,
    preview: () => ["입력한 행동 수행", "피로도 +5", "시간 1칸"],
  },
];

export const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

/* ---------------- 랜덤 이벤트 ---------------- */
// cond(s)->bool, prob(s)->0..1, apply(s)-> {deltas, text, npcName?, choices?}
export const EVENTS = [
  {
    id: "cold", cond: (s) => s.body.health < 55 || s.body.illnessRisk > 55, prob: (s) => 0.18 + s.body.illnessRisk / 400,
    apply: () => ({ deltas: { "body.health": -10, "body.fatigue": 15, "mind.stress": 6 }, flag: "sick", text: "몸이 으슬으슬하다. 감기에 걸린 것 같다. 쉬거나 병원에 가는 게 좋겠다." }),
  },
  {
    id: "late", cond: (s) => s.body.fatigue > 75 && (s.character.jobType === "정규직" || s.character.jobType === "알바"), prob: () => 0.25,
    apply: () => ({ deltas: { "mind.stress": 8, "social.trust": -3, "skills.work": 0 }, text: "늦잠을 자버렸다. 지각. 눈치가 보인다.", npcDelta: { role: "상사/선배", trust: -3 } }),
  },
  {
    id: "phone_break", cond: (s) => hasItem(s, "스마트폰"), prob: () => 0.04,
    apply: () => ({ deltas: { "money.cash": -80000, "mind.stress": 10 }, text: "스마트폰이 갑자기 먹통이 됐다. 수리비가 나갔다." }),
  },
  {
    id: "impulse", cond: (s) => s.mind.stress > 80, prob: () => 0.3,
    apply: () => ({ deltas: { "money.cash": -55000, "mind.stress": -10 }, text: "스트레스가 폭발해 충동적으로 결제 버튼을 눌러버렸다. 잠깐은 후련하지만…" }),
  },
  {
    id: "rent_up", cond: (s) => s.time.day === 1 && s.housing.type !== "부모님 집", prob: () => 0.12,
    apply: (s) => ({ deltas: {}, set: { rentUp: true }, text: "집주인에게서 연락이 왔다. 다음 달부터 월세를 올리겠다고 한다." }),
  },
  {
    id: "viral_chance", cond: (s) => s.social.fame > 25, prob: () => 0.1,
    apply: () => ({ deltas: { "social.fame": 5 }, sns: { followers: 800 }, text: "올린 게시물 하나가 갑자기 퍼지기 시작했다. 알림이 멈추질 않는다." }),
  },
  {
    id: "scam", cond: (s) => s.money.cash + s.money.bank < 300000, prob: () => 0.08,
    apply: () => ({ deltas: {}, text: "'하루 30만원 보장' 고수익 알바 DM이 왔다. 수상하지만 돈이 급하다.", choices: ["무시한다", "혹시 몰라 알아본다"] }),
  },
  {
    id: "gig", cond: (s) => s.skills.coding > 50 || s.skills.creativity > 50, prob: () => 0.1,
    apply: () => ({ deltas: {}, set: { gigOffer: true }, text: "지인이 작은 외주 건을 제안했다. 부업으로 처리할 수 있을 것 같다." }),
  },
];

/* ---------------- 헬퍼 ---------------- */
export function hasItem(s, name) {
  return s.inventory.some((i) => i.name === name);
}
export function hasMonthlyItem(s, name) {
  return s.inventory.some((i) => i.name === name && i.monthLeft > 0);
}
export function itemMul(s, name, key) {
  const it = s.inventory.find((i) => i.name === name);
  if (!it) return 1;
  return ITEM_DEFS[name]?.effects?.[key] || 1;
}
