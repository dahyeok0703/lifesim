// OpenAI API 래퍼: 동적 이벤트 생성 및 선택 결과 해석
// 클라이언트는 세션별로 주입받는다 (UI에서 입력한 API 키 사용).
import OpenAI from "openai";
import { ageOf, money, statLabel, STAT_KEYS } from "./game.js";

export const DEFAULT_MODEL = process.env.LIFESIM_MODEL || "gpt-4o";

// UI 입력 키 우선, 없으면 환경변수 사용. 키가 없으면 null.
export function makeClient(apiKey) {
  const key = (apiKey && apiKey.trim()) || process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function stateSummary(state) {
  const stats = STAT_KEYS.map((k) => `${statLabel(k)} ${state.stats[k]}`).join(", ");
  const rels = state.relationships.length
    ? state.relationships
        .map((r) => `${r.name}(${r.type}, 친밀도 ${r.closeness})`)
        .join(", ")
    : "없음";
  const recent = state.log
    .slice(-6)
    .map((l) => `- ${l.date}(${l.age}세): ${l.text}`)
    .join("\n");

  return `[인물 정보]
이름: ${state.name} (${state.gender})
나이: ${ageOf(state)}세
현재 시점: ${state.date.year}년 ${state.date.month}월
학력: ${state.education}
직업: ${state.job ? `${state.job.title} (연봉 ${money(state.job.salary)})` : "무직"}
자산: ${money(state.money)}
능력치(0~100): ${stats}
성격/특성: ${state.traits.length ? state.traits.join(", ") : "없음"}
인간관계: ${rels}${state.background ? `\n배경: ${state.background}` : ""}
${recent ? `\n[최근 일지]\n${recent}` : ""}`;
}

const SYSTEM = `당신은 "LifeSim 2026"이라는 인생 시뮬레이션 게임의 게임 마스터입니다.
플레이어는 2026년 대한민국의 현실세계를 살아가는 한 사람입니다.

규칙:
- 2026년 현실의 사회/경제/기술/문화 맥락(고물가, AI 보편화, 취업난, 부동산, SNS, 기후, 정치 분위기 등)을 자연스럽게 반영합니다.
- 인물의 나이, 직업, 자산, 능력치, 인간관계에 개연성 있게 맞춰 사건을 만듭니다.
- 너무 황당하거나 비현실적이지 않게, 그러나 지루하지 않게 흥미로운 사건을 제시합니다.
- 한국어로, 몰입감 있고 간결한 문체로 서술합니다.
- 반드시 지정된 JSON 형식의 객체로만 응답합니다.`;

async function callJSON(ctx, userPrompt, maxTokens = 1200) {
  const res = await ctx.client.chat.completions.create({
    model: ctx.model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
  });
  const text = res.choices?.[0]?.message?.content || "";
  return JSON.parse(text);
}

// API 키 유효성 가벼운 검증 (잘못된 키면 throw)
export async function verifyClient(ctx) {
  await ctx.client.chat.completions.create({
    model: ctx.model || DEFAULT_MODEL,
    max_tokens: 5,
    messages: [{ role: "user", content: "ping" }],
  });
  return true;
}

export async function generateEvent(ctx, state) {
  const prompt = `${stateSummary(state)}

위 인물에게 이번 달(${state.date.year}년 ${state.date.month}월)에 일어나는 하나의 사건/상황을 만들어 주세요.
3~4개의 선택지를 제시하되, 각 선택지의 결과(능력치 변화 등)는 절대 미리 알려주지 마세요.

JSON 형식:
{
  "title": "사건의 짧은 제목",
  "narrative": "2~4문장의 상황 서술",
  "choices": [
    {"label": "선택지 내용 (한 문장)"},
    {"label": "..."}
  ]
}`;
  return callJSON(ctx, prompt, 900);
}

export async function resolveChoice(ctx, state, action, isCustom = false) {
  const actionDesc = isCustom
    ? `플레이어가 직접 입력한 자유 행동: "${action}"`
    : `플레이어가 선택한 행동: "${action}"`;

  const prompt = `${stateSummary(state)}

직전 상황: ${state.pending ? state.pending.narrative : "(일상)"}

${actionDesc}

이 행동의 결과를 개연성 있게 판정해 주세요. 좋은 결과만이 아니라 때로는 실패, 부작용, 예상치 못한 전개도 있을 수 있습니다.
능력치 변화는 보통 -15 ~ +15 범위로 현실적으로. 돈은 원(KRW) 단위 정수로.
시간은 보통 1개월(age_months: 1) 흐르지만, 큰 사건이면 더 길 수도 있습니다.

JSON 형식 (변화 없는 항목은 생략 가능):
{
  "outcome": "2~4문장의 결과 서술 (구체적이고 생생하게)",
  "effects": {
    "stats": {"health": 0, "happiness": 0, "intelligence": 0, "looks": 0, "fitness": 0},
    "money": 0,
    "job": {"title": "직업명", "salary": 연봉정수} 또는 null (변경 시에만),
    "education": "학력 (변경 시에만)",
    "add_relationships": [{"name": "이름", "type": "관계", "closeness": 50}],
    "relationship_changes": [{"name": "기존이름", "closeness": -10}],
    "remove_relationships": ["이름"],
    "add_traits": ["새 특성"]
  },
  "age_months": 1,
  "death": false,
  "death_reason": ""
}`;
  return callJSON(ctx, prompt, 1200);
}

export async function generateIntro(ctx, state) {
  const prompt = `${stateSummary(state)}

이 인물이 2026년을 살아가기 시작하는 도입부를 2~3문장으로 써주세요. 인물의 현재 처지와 분위기를 그려주세요.

JSON 형식: {"intro": "도입부 텍스트"}`;
  const r = await callJSON(ctx, prompt, 400);
  return r.intro;
}
