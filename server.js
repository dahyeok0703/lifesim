import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  createCharacter,
  applyEffects,
  advanceTime,
  checkDeath,
  pushLog,
  fallbackEvent,
  ageOf,
} from "./src/game.js";
import { aiEnabled, generateEvent, resolveChoice, generateIntro } from "./src/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map(); // sessionId -> state

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// AI 이벤트 생성, 실패 시 폴백
async function nextEvent(state) {
  if (aiEnabled()) {
    try {
      const ev = await generateEvent(state);
      if (ev && Array.isArray(ev.choices) && ev.choices.length) {
        ev._ai = true;
        return ev;
      }
    } catch (e) {
      console.error("AI 이벤트 생성 실패, 폴백 사용:", e.message);
    }
  }
  const ev = fallbackEvent(state);
  ev._ai = false;
  return ev;
}

function fallbackResolveText(state, choice) {
  const e = choice.effects || {};
  const parts = [];
  if (e.money) parts.push(e.money > 0 ? "약간의 수입이 생겼다" : "지출이 있었다");
  if (e.stats?.happiness > 0) parts.push("기분이 나아졌다");
  if (e.stats?.happiness < 0) parts.push("마음이 무거워졌다");
  return `${choice.label}. ${parts.join(", ") || "하루가 지나갔다"}.`;
}

function publicState(state) {
  return { ...state, age: ageOf(state) };
}

app.post("/api/new", async (req, res) => {
  try {
    const state = createCharacter(req.body || {});
    const id = newId();
    sessions.set(id, state);

    let intro = `${state.name}, ${ageOf(state)}세. 2026년의 이야기가 시작된다.`;
    if (aiEnabled()) {
      try {
        intro = await generateIntro(state);
      } catch (e) {
        console.error("intro 생성 실패:", e.message);
      }
    }
    pushLog(state, intro);

    const event = await nextEvent(state);
    state.pending = event;

    res.json({ sessionId: id, state: publicState(state), intro, event, aiEnabled: aiEnabled() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

async function handleAction(state, actionLabel, isCustom, presetEffects) {
  let outcome, effects, ageMonths = 1, death = false, deathReason = "";

  if (aiEnabled() && (isCustom || !presetEffects)) {
    try {
      const r = await resolveChoice(state, actionLabel, isCustom);
      outcome = r.outcome;
      effects = r.effects || {};
      ageMonths = r.age_months || 1;
      death = !!r.death;
      deathReason = r.death_reason || "";
    } catch (e) {
      console.error("AI 결과 판정 실패, 폴백:", e.message);
    }
  }

  if (outcome === undefined) {
    // 폴백 판정
    effects = presetEffects || { stats: { happiness: Math.random() < 0.5 ? 3 : -3 } };
    outcome = isCustom
      ? `${actionLabel}. 나름의 결과가 따랐다.`
      : fallbackResolveText(state, { label: actionLabel, effects });
  }

  applyEffects(state, effects);
  pushLog(state, outcome);
  advanceTime(state, ageMonths);
  checkDeath(state);

  if (death && state.alive) {
    state.alive = false;
    state.causeOfDeath = deathReason || "예기치 못한 사고";
  }
  return outcome;
}

app.post("/api/choose", async (req, res) => {
  try {
    const { sessionId, choiceIndex } = req.body;
    const state = sessions.get(sessionId);
    if (!state) return res.status(404).json({ error: "세션 없음" });
    if (!state.alive) return res.status(400).json({ error: "이미 사망했습니다" });
    if (!state.pending) return res.status(400).json({ error: "진행 중인 이벤트가 없습니다" });

    const choice = state.pending.choices[choiceIndex];
    if (!choice) return res.status(400).json({ error: "잘못된 선택" });

    const preset = state.pending._ai ? null : choice.effects;
    const outcome = await handleAction(state, choice.label, false, preset);

    let event = null;
    if (state.alive) {
      event = await nextEvent(state);
      state.pending = event;
    } else {
      state.pending = null;
    }
    res.json({ state: publicState(state), outcome, event });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/custom", async (req, res) => {
  try {
    const { sessionId, action } = req.body;
    const state = sessions.get(sessionId);
    if (!state) return res.status(404).json({ error: "세션 없음" });
    if (!state.alive) return res.status(400).json({ error: "이미 사망했습니다" });
    if (!action || !action.trim()) return res.status(400).json({ error: "행동을 입력하세요" });

    const outcome = await handleAction(state, action.trim(), true, null);

    let event = null;
    if (state.alive) {
      event = await nextEvent(state);
      state.pending = event;
    } else {
      state.pending = null;
    }
    res.json({ state: publicState(state), outcome, event });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/state", (req, res) => {
  const state = sessions.get(req.query.sessionId);
  if (!state) return res.status(404).json({ error: "세션 없음" });
  res.json({ state: publicState(state), event: state.pending });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LifeSim 2026 → http://localhost:${PORT}  (AI: ${aiEnabled() ? "ON" : "OFF (폴백 모드)"})`);
});
