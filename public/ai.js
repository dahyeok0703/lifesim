// AI = 내레이터. 상황 묘사/NPC 대사/선택지 자연어만 생성.
// 돈·시간·확률·수치·저장은 절대 AI가 결정하지 않는다(엔진 전담).
import { Store } from "./store.js";
import { LOCATIONS, ACTION_MAP } from "./engine/content.js";
import { SLOTS } from "./engine/time.js";
import { goalProgress } from "./engine/engine.js";
import { labelOf } from "./engine/state.js";

export function aiAvailable() { return !!Store.getKey(); }

function ctxSummary(s) {
  const npcBrief = s.npcs.slice(0, 6).map((n) => `${n.name}(${n.role},호감${n.affinity}${n.memories[0] ? `,기억:${n.memories[0].text}` : ""})`).join("; ");
  const recent = s.logs.slice(-8).map((l) => `${l.date} ${l.slot}: ${l.text}`).join("\n");
  return `[캐릭터] ${s.character.name}/${s.character.gender}/${s.character.age}세/${s.character.region}/${s.character.job}/${s.character.education} · 성격:${s.character.personality}
[시간] ${s.time.year}-${s.time.month}-${s.time.day} ${SLOTS[s.time.slot] || "심야"} · 위치:${s.location}
[몸] 체력${s.body.stamina} 피로${s.body.fatigue} 건강${s.body.health} 식사${s.body.mealState}
[정신] 멘탈${s.mind.mental} 스트레스${s.mind.stress} 자존감${s.mind.selfEsteem} 동기${s.mind.motivation}
[돈] 현금${s.money.cash} 통장${s.money.bank} 부채${s.money.debt}
[목표] ${s.goalTitle} (진행률 ${goalProgress(s).progress}%)
[NPC] ${npcBrief}
[최근 기록]\n${recent}`;
}

const SYSTEM = `당신은 인생 시뮬레이션 게임 "LifeSim AI"의 내레이터입니다.
당신의 역할은 오직: (1) 현실적인 상황 묘사, (2) NPC 대사, (3) 다음 행동 선택지의 자연어 설명입니다.

절대 규칙:
- 돈·시간·체력·확률·능력치·관계 수치는 시스템이 이미 계산했습니다. 당신은 그 수치를 바꾸거나 새로 만들지 마세요.
- 유저가 하지 않은 행동을 했다고 절대 서술하지 마세요. 주어진 '행동'과 그 '판정 결과'의 범위 안에서만 묘사합니다.
  (예: 유저가 "집에 간다"만 했으면 "집에 가서 공부했다"처럼 추가 행동을 만들면 안 됩니다.)
- 시스템이 준 판정 등급(대성공/성공/부분 성공/실패/큰 실패)과 변화 방향에 톤을 맞추세요. 실패면 실패답게.
- 과장된 소설체가 아니라, 현실적인 시뮬레이션 보고체 + 자연스러운 묘사를 섞습니다. 2~4문장.
- NPC가 등장하면 과거 기억(관계/사건)을 반영한 반응을 보이세요.
- 반드시 아래 JSON으로만 응답합니다.`;

function shape() {
  return `{
  "narration": "현재 상황과 행동 결과를 2~4문장으로 (보고체+묘사)",
  "npcLine": "관련 NPC가 있으면 그 대사, 없으면 빈 문자열",
  "suggestions": ["다음에 할 만한 구체적 행동 3개"]
}`;
}

export async function narrate(s, result, userInput) {
  if (!aiAvailable()) return fallback(s, result, userInput);

  const appliedStr = Object.entries(result.applied || {})
    .map(([k, v]) => `${labelOf(k)} ${v > 0 ? "+" : ""}${v}`).join(", ");
  const loc = LOCATIONS[s.location];
  const actions = (loc?.actions || []).map((id) => ACTION_MAP[id]?.label).filter(Boolean).join(", ");

  const user = `${ctxSummary(s)}

[유저의 입력] "${userInput}"
[수행된 행동] ${result.action?.label || userInput}
[판정 결과] ${result.tier}
[시스템이 적용한 수치 변화] ${appliedStr || "미미함"}${result.earned ? `, 수입 +${result.earned}원` : ""}${result.spend ? `, 지출 ${result.spend}원` : ""}
${result.sns ? `[SNS] 팔로워 ${result.sns.followerDelta >= 0 ? "+" : ""}${result.sns.followerDelta}, ${result.sns.note}` : ""}
${result.events?.length ? `[발생 사건] ${result.events.map((e) => e.text).join(" / ")}` : ""}
${result.jobMsg ? `[중요] ${result.jobMsg}` : ""}
[현재 위치에서 가능한 행동] ${actions}

위 사실만을 바탕으로, 정해진 행동/결과 범위 안에서 서술하세요. 다음 JSON으로만:
${shape()}`;

  try {
    const res = await fetch("/api/narrate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: Store.getKey(), model: Store.getModel(), json: true, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "AI 오류");
    const parsed = JSON.parse(data.text);
    return { narration: parsed.narration || "", npcLine: parsed.npcLine || "", suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] };
  } catch (e) {
    console.error("내레이션 실패, 폴백:", e.message);
    return fallback(s, result, userInput);
  }
}

// AI 키 검증
export async function verifyKey(apiKey, model) {
  const res = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, model }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "검증 실패");
  return true;
}

// 폴백 내레이션 (AI 없이도 충분히 플레이 가능)
function fallback(s, result, userInput) {
  const t = `${s.time.year}-${String(s.time.month).padStart(2, "0")}-${String(s.time.day).padStart(2, "0")}`;
  const slot = SLOTS[s.time.slot] || "심야";
  const label = result.action?.label || userInput;
  const tierTxt = {
    "대성공": "기대 이상으로 잘 풀렸다.", "성공": "무난하게 해냈다.",
    "부분 성공": "절반의 성과에 그쳤다.", "실패": "뜻대로 되지 않았다.",
    "큰 실패": "오히려 일을 그르치고 말았다.", "수면": "푹 자고 일어났다.",
  }[result.tier] || "";
  let n = `${t} ${slot}, ${s.location}. ${label}. ${tierTxt}`;
  if (result.sns) n += ` 팔로워가 ${result.sns.followerDelta >= 0 ? "늘었다" : "줄었다"}. ${result.sns.note}`;
  if (result.npcChanges?.length) { const c = result.npcChanges[0]; n += ` ${c.name}와(과)의 사이가 ${c.affinity >= 0 ? "조금 가까워졌다" : "서먹해졌다"}.`; }
  if (result.jobMsg) n += ` ${result.jobMsg}`;
  if (result.events?.length) n += ` ${result.events[0].text}`;

  const loc = LOCATIONS[s.location];
  const suggestions = (loc?.actions || ["rest", "eat", "sleep"]).slice(0, 3).map((id) => ACTION_MAP[id]?.label).filter(Boolean);
  return { narration: n, npcLine: result.incoming?.text || "", suggestions };
}

// 자유 입력 → 가장 가까운 행동 추정 (간단 키워드 매핑; AI 아님)
const INTENT = [
  ["parttime", ["알바", "편의점", "아르바이트"]], ["work", ["출근", "회사"]],
  ["study", ["공부", "시험", "강의", "인강"]], ["coding", ["코딩", "개발", "프로그래밍"]],
  ["create", ["창작", "그림", "글", "영상편집", "작곡", "디자인"]], ["workout", ["운동", "헬스", "런닝", "러닝", "근력"]],
  ["rest", ["휴식", "쉰다", "쉬기", "눕", "낮잠"]], ["sleep", ["잔다", "수면", "잠", "취침"]],
  ["eat", ["밥", "식사", "먹"]], ["walk", ["산책", "걷"]], ["shopping", ["쇼핑", "산다", "구매"]],
  ["hospital", ["병원", "진료", "약"]], ["sns", ["sns", "인스타", "유튜브", "게시", "업로드", "트위터", "x에"]],
  ["jobhunt", ["구직", "이력서", "지원", "취업준비"]], ["interview", ["면접"]],
  ["sidejob", ["부업", "외주"]], ["drink", ["술", "한잔", "회식"]], ["talk", ["대화", "연락", "전화", "만나"]],
  ["bank", ["저축", "예금", "은행"]],
];
export function guessAction(text) {
  const m = (text || "").toLowerCase();
  for (const [id, kws] of INTENT) if (kws.some((k) => m.includes(k))) return id;
  return null;
}
