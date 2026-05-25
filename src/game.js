// 게임 상태 모델, 스탯 로직, 그리고 AI 미사용 시 폴백 이벤트 엔진

export const STAT_KEYS = ["health", "happiness", "intelligence", "looks", "fitness"];

const STAT_LABELS = {
  health: "건강",
  happiness: "행복",
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
  // 한국식 만 나이 근사
  return state.date.year - state.birthYear;
}

export function createCharacter(opts = {}) {
  const gender = opts.gender || pick(["남성", "여성"]);
  const startAge = opts.age != null ? Number(opts.age) : 18;
  const year = 2026;
  const name = opts.name?.trim() || randomName(gender);

  const state = {
    name,
    gender,
    birthYear: year - startAge,
    date: { year, month: 1 },
    turn: 0,
    alive: true,
    causeOfDeath: null,
    stats: {
      health: opts.stats?.health ?? rand(70, 95),
      happiness: opts.stats?.happiness ?? rand(55, 80),
      intelligence: opts.stats?.intelligence ?? rand(45, 85),
      looks: opts.stats?.looks ?? rand(40, 85),
      fitness: opts.stats?.fitness ?? rand(45, 85),
    },
    money: opts.money ?? rand(0, 300) * 10000, // 0 ~ 300만원
    job: opts.job || null,
    education: opts.education || "고등학교 졸업",
    background: opts.background || "",
    relationships: opts.relationships || defaultRelationships(),
    traits: opts.traits || [],
    log: [],
    pending: null, // 현재 제시된 이벤트 { narrative, choices }
  };
  return state;
}

function defaultRelationships() {
  return [
    { name: "어머니", type: "가족", closeness: rand(60, 90) },
    { name: "아버지", type: "가족", closeness: rand(55, 90) },
  ];
}

// effects 예시: { stats: {health:-5, happiness:+10}, money: -50000, age_months: 1, log: "..." }
export function applyEffects(state, effects = {}) {
  if (effects.stats) {
    for (const k of STAT_KEYS) {
      if (typeof effects.stats[k] === "number") {
        state.stats[k] = clamp(state.stats[k] + effects.stats[k], 0, 100);
      }
    }
  }
  if (typeof effects.money === "number") {
    state.money += effects.money;
  }
  if (effects.job !== undefined) {
    state.job = effects.job; // {title, salary} 또는 null
  }
  if (effects.education) {
    state.education = effects.education;
  }
  if (Array.isArray(effects.add_relationships)) {
    for (const r of effects.add_relationships) {
      if (r && r.name) {
        state.relationships.push({
          name: r.name,
          type: r.type || "지인",
          closeness: clamp(r.closeness ?? 50, 0, 100),
        });
      }
    }
  }
  if (Array.isArray(effects.relationship_changes)) {
    for (const c of effects.relationship_changes) {
      const rel = state.relationships.find((r) => r.name === c.name);
      if (rel && typeof c.closeness === "number") {
        rel.closeness = clamp(rel.closeness + c.closeness, 0, 100);
      }
    }
  }
  if (Array.isArray(effects.remove_relationships)) {
    state.relationships = state.relationships.filter(
      (r) => !effects.remove_relationships.includes(r.name)
    );
  }
  if (Array.isArray(effects.add_traits)) {
    for (const t of effects.add_traits) {
      if (t && !state.traits.includes(t)) state.traits.push(t);
    }
  }
  return state;
}

export function advanceTime(state, months = 1) {
  let m = state.date.month + months;
  let y = state.date.year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  state.date.year = y;
  state.date.month = m;
  state.turn += 1;

  // 자연스러운 노화/스탯 드리프트
  const age = ageOf(state);
  if (age > 35) state.stats.fitness = clamp(state.stats.fitness - 1, 0, 100);
  if (age > 55) state.stats.health = clamp(state.stats.health - 1, 0, 100);
  if (age > 50) state.stats.looks = clamp(state.stats.looks - 1, 0, 100);

  // 직업 수입 (월급) 자동 반영
  if (state.job && typeof state.job.salary === "number") {
    state.money += Math.round((state.job.salary * months) / 12);
  }
  // 기본 생활비
  state.money -= 80 * 10000 * months; // 월 80만원 가정 생활비
}

export function checkDeath(state) {
  if (!state.alive) return state;
  const age = ageOf(state);
  if (state.stats.health <= 0) {
    state.alive = false;
    state.causeOfDeath = "건강 악화";
    return state;
  }
  if (age >= 75) {
    // 나이가 들수록 사망 확률 증가
    const risk = (age - 70) * 0.04;
    if (Math.random() < risk) {
      state.alive = false;
      state.causeOfDeath = "노환";
    }
  }
  return state;
}

export function pushLog(state, text) {
  state.log.push({
    date: `${state.date.year}.${String(state.date.month).padStart(2, "0")}`,
    age: ageOf(state),
    text,
  });
  if (state.log.length > 200) state.log.shift();
}

export function money(n) {
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1) + "억";
  if (Math.abs(n) >= 10000) return Math.round(n / 10000) + "만원";
  return n + "원";
}

// ---------- 폴백 이벤트 엔진 (AI 키가 없을 때) ----------

const FALLBACK_EVENTS = [
  {
    when: (s) => ageOf(s) >= 18 && ageOf(s) <= 26 && !s.job,
    build: (s) => ({
      title: "진로의 갈림길",
      narrative: `${ageOf(s)}살. 주변 친구들은 하나둘 진로를 정해간다. ${s.name}은(는) 무엇을 할지 고민 중이다.`,
      choices: [
        { label: "대학에 진학한다", effects: { stats: { intelligence: 8, happiness: 3 }, money: -3000000, education: "대학 재학" } },
        { label: "바로 취업 전선에 뛰어든다", effects: { stats: { fitness: -2, happiness: -2 }, money: 1500000, job: { title: "신입 사원", salary: 28000000 } } },
        { label: "공무원 시험을 준비한다", effects: { stats: { intelligence: 5, happiness: -5 }, money: -1000000 } },
        { label: "1년간 세계 여행을 떠난다", effects: { stats: { happiness: 15, fitness: 5, intelligence: 4 }, money: -8000000, add_traits: ["견문이 넓음"] } },
      ],
    }),
  },
  {
    when: (s) => s.job,
    build: (s) => ({
      title: "직장에서의 하루",
      narrative: `${s.job.title}으로 일하는 평범한 한 달. 그런데 상사가 무리한 야근을 요구한다.`,
      choices: [
        { label: "묵묵히 야근을 받아들인다", effects: { stats: { health: -4, happiness: -5, fitness: -3 }, money: 300000 } },
        { label: "정중히 거절한다", effects: { stats: { happiness: 3, health: 2 }, relationship_changes: [] } },
        { label: "이직을 알아본다", effects: { stats: { happiness: 4, intelligence: 2 } } },
      ],
    }),
  },
  {
    when: () => true,
    build: (s) => ({
      title: "주말의 선택",
      narrative: `여유로운 주말, ${s.name}은(는) 시간을 어떻게 보낼지 고민한다.`,
      choices: [
        { label: "운동하며 건강을 챙긴다", effects: { stats: { fitness: 6, health: 4, happiness: 3 } } },
        { label: "친구들과 어울려 논다", effects: { stats: { happiness: 8 }, money: -100000 } },
        { label: "자기계발에 투자한다", effects: { stats: { intelligence: 5, happiness: 1 }, money: -50000 } },
        { label: "집에서 푹 쉰다", effects: { stats: { health: 3, happiness: 4, fitness: -1 } } },
      ],
    }),
  },
  {
    when: (s) => s.money > 5000000,
    build: (s) => ({
      title: "투자 제안",
      narrative: `지인이 솔깃한 투자 이야기를 꺼낸다. 2026년, 모두가 돈 버는 법을 이야기하는 시대다.`,
      choices: [
        { label: "안정적으로 예금에 넣는다", effects: { money: -10000, stats: { happiness: 1 } } },
        { label: "주식에 투자한다", effects: { money: Math.random() < 0.5 ? 2000000 : -2500000, stats: { happiness: Math.random() < 0.5 ? 5 : -6 } } },
        { label: "거절하고 신중히 지켜본다", effects: { stats: { intelligence: 2 } } },
      ],
    }),
  },
];

export function fallbackEvent(state) {
  const candidates = FALLBACK_EVENTS.filter((e) => e.when(state));
  const chosen = pick(candidates.length ? candidates : FALLBACK_EVENTS);
  return chosen.build(state);
}
