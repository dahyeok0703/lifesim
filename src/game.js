// 게임 상태 모델, 스탯/도메인 로직, 그리고 AI 미사용 시 폴백 채팅 엔진

export const STAT_KEYS = ["health", "happiness", "mental", "intelligence", "looks", "fitness"];

const STAT_LABELS = {
  health: "건강",
  happiness: "행복",
  mental: "정신력",
  intelligence: "지능",
  looks: "외모",
  fitness: "체력",
};

export function statLabel(key) {
  return STAT_LABELS[key] || key;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const GIVEN_M = ["민준", "서준", "도윤", "예준", "시우", "주원", "하준", "지호", "준서", "건우", "현우", "지훈"];
const GIVEN_F = ["서연", "지우", "서윤", "지유", "하은", "민서", "수아", "지아", "지윤", "다은", "은서", "예린"];

export function randomName(gender) {
  const given = gender === "여성" ? GIVEN_F : GIVEN_M;
  return pick(SURNAMES) + pick(given);
}

export function ageOf(state) {
  return state.date.year - state.birthYear;
}

export function netWorth(state) {
  const f = state.finance;
  return f.cash + f.savings + f.investments - f.debt;
}

export function createCharacter(opts = {}) {
  const gender = opts.gender || pick(["남성", "여성"]);
  const startAge = opts.age != null ? Number(opts.age) : 18;
  const year = 2026;
  const name = opts.name?.trim() || randomName(gender);

  return {
    name,
    gender,
    birthYear: year - startAge,
    date: { year, month: 1 },
    turn: 0,
    alive: true,
    causeOfDeath: null,

    stats: {
      health: rand(75, 95),
      happiness: rand(55, 80),
      mental: rand(60, 85),
      intelligence: rand(45, 85),
      looks: rand(40, 85),
      fitness: rand(45, 85),
    },

    finance: {
      cash: rand(20, 200) * 10000, // 통장 현금
      savings: rand(0, 300) * 10000, // 예금/적금
      investments: 0, // 투자 평가액
      debt: startAge >= 20 ? rand(0, 1500) * 10000 : 0, // 학자금/대출 등
      monthlyIncome: 0,
      monthlyExpense: rand(60, 110) * 10000, // 월 생활비
    },

    education: {
      level: startAge >= 23 ? "대학교 졸업" : "고등학교 졸업",
      school: startAge >= 19 && startAge <= 23 ? "○○대학교" : "",
      major: "",
      gpa: 0,
      status: startAge >= 19 && startAge <= 23 ? "재학" : "없음",
      certificates: [],
    },

    career: {
      job: "",
      company: "",
      position: "",
      salary: 0,
      satisfaction: 50,
      yearsExperience: 0,
    },

    love: {
      status: "솔로", // 솔로/썸/연애중/약혼/기혼
      partner: null, // { name, affinity }
      married: false,
    },

    sns: {
      handle: "@" + (name.length ? name : "me") + rand(10, 99),
      platform: "인스타그램",
      followers: rand(80, 500),
      posts: rand(0, 40),
      influence: rand(5, 25), // 영향력 0~100
      recentPosts: [],
    },

    relationships: [
      { name: "어머니", type: "가족", closeness: rand(60, 90) },
      { name: "아버지", type: "가족", closeness: rand(55, 90) },
    ],

    inventory: [{ name: "스마트폰", note: "필수품" }],
    hobbies: [],
    traits: [],
    background: opts.background || "",

    chat: [], // { role: 'user'|'gm', text, date }
    log: [], // { date, age, text }
    suggestions: [], // GM이 제안하는 행동 힌트
  };
}

// ---------- 효과 적용 ----------

function addClampStat(state, k, v) {
  if (typeof v === "number") state.stats[k] = clamp(state.stats[k] + v, 0, 100);
}

export function applyEffects(state, e = {}) {
  // 능력치 (델타)
  if (e.stats) for (const k of STAT_KEYS) addClampStat(state, k, e.stats[k]);

  // 자산 (델타, 원 단위)
  if (e.finance) {
    const f = state.finance;
    for (const k of ["cash", "savings", "investments", "debt", "monthlyIncome", "monthlyExpense"]) {
      if (typeof e.finance[k] === "number") {
        f[k] += e.finance[k];
        if (k !== "cash") f[k] = Math.max(0, f[k]); // 현금은 음수(빚 직전) 허용 안 함 → 아래서 처리
      }
    }
    if (f.cash < 0) {
      // 현금 부족분은 빚으로
      f.debt += -f.cash;
      f.cash = 0;
    }
  }

  // 학업 (set)
  if (e.education) {
    const ed = state.education;
    for (const k of ["level", "school", "major", "status"]) {
      if (e.education[k] != null) ed[k] = e.education[k];
    }
    if (typeof e.education.gpa === "number") ed.gpa = clamp(e.education.gpa, 0, 4.5);
    if (e.education.add_certificate) {
      const c = e.education.add_certificate;
      const arr = Array.isArray(c) ? c : [c];
      for (const cert of arr) if (cert && !ed.certificates.includes(cert)) ed.certificates.push(cert);
    }
  }

  // 일/커리어 (set; salary/satisfaction은 절대값)
  if (e.career) {
    const c = state.career;
    for (const k of ["job", "company", "position"]) {
      if (e.career[k] != null) c[k] = e.career[k];
    }
    if (typeof e.career.salary === "number") c.salary = Math.max(0, e.career.salary);
    if (typeof e.career.satisfaction === "number") c.satisfaction = clamp(e.career.satisfaction, 0, 100);
    if (typeof e.career.yearsExperience === "number") c.yearsExperience = e.career.yearsExperience;
    // 직장 생기면 월수입 자동 추정 (명시 income 없을 때)
    if (e.career.salary && !(e.finance && e.finance.monthlyIncome)) {
      state.finance.monthlyIncome = Math.round((c.salary / 12) * 0.85); // 세후 근사
    }
    if (e.career.quit) {
      c.job = ""; c.company = ""; c.position = ""; c.salary = 0;
      state.finance.monthlyIncome = 0;
    }
  }

  // 사랑 (set)
  if (e.love) {
    const l = state.love;
    if (e.love.status != null) l.status = e.love.status;
    if (e.love.partner_name != null) {
      if (e.love.partner_name === "") l.partner = null;
      else if (!l.partner || l.partner.name !== e.love.partner_name) {
        l.partner = { name: e.love.partner_name, affinity: e.love.partner_affinity ?? 50 };
      }
    }
    if (l.partner && typeof e.love.partner_affinity_delta === "number") {
      l.partner.affinity = clamp(l.partner.affinity + e.love.partner_affinity_delta, 0, 100);
    }
    if (typeof e.love.married === "boolean") l.married = e.love.married;
    if (e.love.breakup) { l.partner = null; l.status = "솔로"; }
  }

  // SNS
  if (e.sns) {
    const s = state.sns;
    if (typeof e.sns.followers_delta === "number") s.followers = Math.max(0, s.followers + e.sns.followers_delta);
    if (typeof e.sns.posts_delta === "number") s.posts = Math.max(0, s.posts + e.sns.posts_delta);
    if (typeof e.sns.influence === "number") s.influence = clamp(e.sns.influence, 0, 100);
    if (e.sns.platform) s.platform = e.sns.platform;
    if (e.sns.new_post) {
      s.recentPosts.unshift({ date: dateStr(state), text: e.sns.new_post });
      if (s.recentPosts.length > 8) s.recentPosts.pop();
    }
  }

  // 인간관계
  if (Array.isArray(e.add_relationships)) {
    for (const r of e.add_relationships) {
      if (r && r.name && !state.relationships.find((x) => x.name === r.name)) {
        state.relationships.push({ name: r.name, type: r.type || "지인", closeness: clamp(r.closeness ?? 50, 0, 100) });
      }
    }
  }
  if (Array.isArray(e.relationship_changes)) {
    for (const c of e.relationship_changes) {
      const rel = state.relationships.find((r) => r.name === c.name);
      if (rel && typeof c.closeness === "number") rel.closeness = clamp(rel.closeness + c.closeness, 0, 100);
    }
  }
  if (Array.isArray(e.remove_relationships)) {
    state.relationships = state.relationships.filter((r) => !e.remove_relationships.includes(r.name));
  }

  // 소지품/자산 아이템
  if (Array.isArray(e.add_inventory)) {
    for (const it of e.add_inventory) if (it && it.name) state.inventory.push({ name: it.name, note: it.note || "" });
  }
  if (Array.isArray(e.remove_inventory)) {
    state.inventory = state.inventory.filter((it) => !e.remove_inventory.includes(it.name));
  }

  // 취미/특성
  if (Array.isArray(e.add_hobbies)) for (const h of e.add_hobbies) if (h && !state.hobbies.includes(h)) state.hobbies.push(h);
  if (Array.isArray(e.add_traits)) for (const t of e.add_traits) if (t && !state.traits.includes(t)) state.traits.push(t);

  return state;
}

export function dateStr(state) {
  return `${state.date.year}.${String(state.date.month).padStart(2, "0")}`;
}

export function advanceTime(state, months = 1) {
  let m = state.date.month + months;
  let y = state.date.year;
  while (m > 12) { m -= 12; y += 1; }
  state.date.year = y;
  state.date.month = m;
  state.turn += 1;

  const age = ageOf(state);
  if (age > 35) addClampStat(state, "fitness", -1);
  if (age > 55) addClampStat(state, "health", -1);
  if (age > 50) addClampStat(state, "looks", -1);

  // 월 현금흐름
  const net = (state.finance.monthlyIncome - state.finance.monthlyExpense) * months;
  state.finance.cash += net;
  if (state.finance.cash < 0) { state.finance.debt += -state.finance.cash; state.finance.cash = 0; }

  // 경력 연수
  if (state.career.job) state.career.yearsExperience += months / 12;
}

export function checkDeath(state) {
  if (!state.alive) return state;
  const age = ageOf(state);
  if (state.stats.health <= 0) { state.alive = false; state.causeOfDeath = "건강 악화"; return state; }
  if (state.stats.mental <= 0) { state.alive = false; state.causeOfDeath = "극심한 정신적 고통"; return state; }
  if (age >= 75) {
    const risk = (age - 70) * 0.04;
    if (Math.random() < risk) { state.alive = false; state.causeOfDeath = "노환"; }
  }
  return state;
}

export function pushChat(state, role, text) {
  state.chat.push({ role, text, date: dateStr(state) });
  if (state.chat.length > 60) state.chat.shift();
}

export function pushLog(state, text) {
  state.log.push({ date: dateStr(state), age: ageOf(state), text });
  if (state.log.length > 300) state.log.shift();
}

export function money(n) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 100000000) return sign + (a / 100000000).toFixed(1) + "억원";
  if (a >= 10000) return sign + Math.round(a / 10000).toLocaleString() + "만원";
  return sign + a.toLocaleString() + "원";
}

// ---------- 폴백 채팅 엔진 (AI 키 없을 때) ----------

const FALLBACK_RULES = [
  { kw: ["취업", "일자리", "면접", "이직", "취직"], reply: "이력서를 다듬고 여러 곳에 지원해봤다. 쉽지 않은 취업 시장이지만 한 걸음 나아갔다.", e: { stats: { mental: -3, intelligence: 1 }, career: { satisfaction: 55 } } },
  { kw: ["공부", "시험", "자격증", "학점", "강의"], reply: "책상 앞에 앉아 집중했다. 머리에 조금씩 지식이 쌓이는 느낌이다.", e: { stats: { intelligence: 4, mental: -2, happiness: -1 } } },
  { kw: ["투자", "주식", "코인", "부동산", "예금", "저축"], reply: "시장을 들여다보며 자산을 굴려봤다. 결과는 시간이 말해주겠지.", e: { finance: { investments: Math.random() < 0.5 ? 500000 : -400000 } } },
  { kw: ["운동", "헬스", "러닝", "다이어트"], reply: "땀을 흘리며 몸을 움직였다. 개운하다.", e: { stats: { fitness: 5, health: 3, happiness: 2 } } },
  { kw: ["데이트", "고백", "연애", "사랑", "썸"], reply: "설레는 시간을 보냈다. 마음이 몽글몽글하다.", e: { stats: { happiness: 6, mental: 2 } } },
  { kw: ["sns", "인스타", "유튜브", "게시", "업로드", "틱톡"], reply: "게시물을 올렸다. 반응을 기다리는 묘한 긴장감.", e: { sns: { followers_delta: rand(-5, 60), posts_delta: 1 } } },
  { kw: ["친구", "약속", "모임", "술"], reply: "사람들과 어울리며 즐거운 시간을 보냈다.", e: { stats: { happiness: 5, mental: 3 }, finance: { cash: -50000 } } },
  { kw: ["쉬", "휴식", "잠", "여행"], reply: "잠시 일상에서 벗어나 충전의 시간을 가졌다.", e: { stats: { mental: 6, health: 3, happiness: 4 } } },
];

export function fallbackChat(state, message) {
  const m = (message || "").toLowerCase();
  const rule = FALLBACK_RULES.find((r) => r.kw.some((k) => m.includes(k)));
  if (rule) return { reply: rule.reply, effects: rule.e, age_months: 1 };
  return {
    reply: "그렇게 한 달을 보냈다. 특별할 것 없는 하루하루가 쌓여 인생이 된다. (AI 키를 입력하면 더 풍부한 전개가 펼쳐집니다.)",
    effects: { stats: { happiness: rand(-2, 3) } },
    age_months: 1,
  };
}

export function fallbackIntro(state) {
  return `${state.name}, ${ageOf(state)}세. ${state.date.year}년의 어느 날. 무엇이든 입력해 하루를 시작해보세요. (예: "편의점 알바를 알아본다", "헬스장에 등록한다", "그 사람에게 연락해본다")`;
}
