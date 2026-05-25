// OpenAI API 래퍼: 채팅 주도형 게임 마스터
// 클라이언트는 세션별로 주입받는다 (UI에서 입력한 API 키 사용).
import OpenAI from "openai";
import { ageOf, money, netWorth, statLabel, STAT_KEYS } from "./game.js";

export const DEFAULT_MODEL = process.env.LIFESIM_MODEL || "gpt-4o";

export function makeClient(apiKey) {
  const key = (apiKey && apiKey.trim()) || process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function stateSummary(state) {
  const s = state;
  const stats = STAT_KEYS.map((k) => `${statLabel(k)} ${s.stats[k]}`).join(", ");
  const f = s.finance;
  const rels = s.relationships.length
    ? s.relationships.map((r) => `${r.name}(${r.type},친밀도${r.closeness})`).join(", ")
    : "없음";
  return `[현재 상태] ${s.date.year}년 ${s.date.month}월
- 인물: ${s.name}, ${s.gender}, ${ageOf(s)}세 ${s.background ? `(${s.background})` : ""}
- 능력치(0~100): ${stats}
- 자산: 현금 ${money(f.cash)}, 예금 ${money(f.savings)}, 투자 ${money(f.investments)}, 빚 ${money(f.debt)}, 월수입 ${money(f.monthlyIncome)}, 월지출 ${money(f.monthlyExpense)} / 순자산 ${money(netWorth(s))}
- 학업: ${s.education.level}, ${s.education.status}${s.education.school ? `, ${s.education.school}` : ""}${s.education.major ? ` ${s.education.major}` : ""}${s.education.certificates.length ? `, 자격증[${s.education.certificates.join(",")}]` : ""}
- 일: ${s.career.job ? `${s.career.company} ${s.career.position} ${s.career.job}, 연봉 ${money(s.career.salary)}, 만족도 ${s.career.satisfaction}` : "무직"}
- 사랑: ${s.love.status}${s.love.partner ? `, 상대 ${s.love.partner.name}(호감 ${s.love.partner.affinity})` : ""}${s.love.married ? ", 기혼" : ""}
- SNS: ${s.sns.platform} ${s.sns.handle}, 팔로워 ${s.sns.followers}, 게시물 ${s.sns.posts}, 영향력 ${s.sns.influence}
- 인간관계: ${rels}
- 소지품: ${s.inventory.map((i) => i.name).join(", ") || "없음"}
- 취미: ${s.hobbies.join(", ") || "없음"} / 특성: ${s.traits.join(", ") || "없음"}`;
}

const SYSTEM = `당신은 "LifeSim 2026" 인생 시뮬레이션 게임의 게임 마스터(GM)입니다.
플레이어는 2026년 대한민국을 살아가는 한 사람이며, 채팅으로 자신이 하고 싶은 행동/말을 자유롭게 입력합니다.
당신은 그 행동의 결과를 개연성 있게 서술하고, 인생의 여러 영역(자산/학업/일/사랑/SNS/인간관계/건강/소지품 등)의 수치를 변화시킵니다.

원칙:
- 2026년 현실(고물가, AI 보편화, 취업난, 부동산, SNS, 주식/코인, 기후, 정치 분위기 등)을 자연스럽게 반영.
- 인물의 현재 상태(나이/직업/자산/능력치/관계)에 맞춰 개연성 있게. 항상 성공시키지 말고 실패·부작용·뜻밖의 전개도 섞을 것.
- 답변(reply)은 한국어로, 1~4문장의 몰입감 있고 구체적인 서술. 게임 마스터로서 상황을 생생히 그려준다.
- 수치 변화는 현실적으로(능력치는 보통 -15~+15). 돈은 원(KRW) 정수.
- 큰 사건이면 시간(age_months)을 여러 달로. 보통은 1.
- 반드시 아래 JSON 객체 형식으로만 응답.

[effects 스키마 — 변화 있는 항목만 포함]
- stats: {health, happiness, mental, intelligence, looks, fitness} (각 항목은 더해질 델타값)
- finance: {cash, savings, investments, debt, monthlyIncome, monthlyExpense} (각 델타값, 원)
- career: {job, company, position, salary(절대,연봉), satisfaction(절대0~100), quit(true면 퇴사)}
- education: {level, school, major, gpa, status, add_certificate}
- love: {status("솔로"/"썸"/"연애중"/"약혼"/"기혼"), partner_name, partner_affinity, partner_affinity_delta, married, breakup}
- sns: {platform, followers_delta, posts_delta, influence(절대), new_post(올린 글 내용)}
- add_relationships: [{name, type, closeness}], relationship_changes: [{name, closeness(델타)}], remove_relationships: [name]
- add_inventory: [{name, note}], remove_inventory: [name]
- add_hobbies: [name], add_traits: [name]`;

const JSON_SHAPE = `{
  "reply": "GM의 서술 (한국어 1~4문장)",
  "effects": { ... 위 스키마 중 변화 있는 항목만 ... },
  "age_months": 1,
  "death": false,
  "death_reason": "",
  "suggestions": ["추천 행동1", "추천 행동2", "추천 행동3"]
}`;

async function callJSON(ctx, messages, maxTokens = 1200) {
  const res = await ctx.client.chat.completions.create({
    model: ctx.model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages,
  });
  return JSON.parse(res.choices?.[0]?.message?.content || "{}");
}

export async function verifyClient(ctx) {
  await ctx.client.chat.completions.create({
    model: ctx.model || DEFAULT_MODEL,
    max_tokens: 5,
    messages: [{ role: "user", content: "ping" }],
  });
  return true;
}

export async function chatTurn(ctx, state, userMessage) {
  const history = state.chat.slice(-8).map((c) => ({
    role: c.role === "user" ? "user" : "assistant",
    content: c.text,
  }));

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: stateSummary(state) },
    ...history,
    {
      role: "user",
      content: `플레이어의 행동/말: "${userMessage}"

이 행동의 결과를 판정해 다음 JSON 형식으로만 응답:
${JSON_SHAPE}`,
    },
  ];
  return callJSON(ctx, messages, 1200);
}

export async function generateIntro(ctx, state) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: stateSummary(state) },
    {
      role: "user",
      content: `이 인물이 2026년을 살아가기 시작하는 도입부를 GM 시점에서 2~3문장으로 써주고, 추천 행동 3개를 제시하세요.
JSON: {"intro": "도입부", "suggestions": ["행동1","행동2","행동3"]}`,
    },
  ];
  return callJSON(ctx, messages, 400);
}
