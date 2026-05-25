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
import {
  makeClient,
  verifyClient,
  generateEvent,
  resolveChoice,
  generateIntro,
  DEFAULT_MODEL,
} from "./src/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map(); // sessionId -> { state, client, model }

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// AI 이벤트 생성, 실패 시 폴백
async function nextEvent(sess) {
  if (sess.client) {
    try {
      const ev = await generateEvent(sess, sess.state);
      if (ev && Array.isArray(ev.choices) && ev.choices.length) {
        ev._ai = true;
        return ev;
      }
    } catch (e) {
      console.error("AI 이벤트 생성 실패, 폴백 사용:", e.message);
    }
  }
  const ev = fallbackEvent(sess.state);
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
    const body = req.body || {};
    const client = makeClient(body.apiKey);
    const model = body.model || DEFAULT_MODEL;

    let aiActive = false;
    let aiError = "";
    if (client) {
      try {
        await verifyClient({ client, model });
        aiActive = true;
      } catch (e) {
        aiError = "API 키 검증 실패: " + e.message + " → 폴백 모드로 진행합니다.";
        console.error(aiError);
      }
    }

    const state = createCharacter(body);
    const sess = { state, client: aiActive ? client : null, model };
    const id = newId();
    sessions.set(id, sess);

    let intro = `${state.name}, ${ageOf(state)}세. 2026년의 이야기가 시작된다.`;
    if (sess.client) {
      try {
        intro = await generateIntro(sess, state);
      } catch (e) {
        console.error("intro 생성 실패:", e.message);
      }
    }
    pushLog(state, intro);

    const event = await nextEvent(sess);
    state.pending = event;

    res.json({
      sessionId: id,
      state: publicState(state),
      intro,
      event,
      aiActive,
      aiError,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

async function handleAction(sess, actionLabel, isCustom, presetEffects) {
  const state = sess.state;
  let outcome, effects, ageMonths = 1, death = false, deathReason = "";

  if (sess.client && (isCustom || !presetEffects)) {
    try {
      const r = await resolveChoice(sess, state, actionLabel, isCustom);
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
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: "세션 없음" });
    const state = sess.state;
    if (!state.alive) return res.status(400).json({ error: "이미 사망했습니다" });
    if (!state.pending) return res.status(400).json({ error: "진행 중인 이벤트가 없습니다" });

    const choice = state.pending.choices[choiceIndex];
    if (!choice) return res.status(400).json({ error: "잘못된 선택" });

    const preset = state.pending._ai ? null : choice.effects;
    const outcome = await handleAction(sess, choice.label, false, preset);

    let event = null;
    if (state.alive) {
      event = await nextEvent(sess);
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
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: "세션 없음" });
    const state = sess.state;
    if (!state.alive) return res.status(400).json({ error: "이미 사망했습니다" });
    if (!action || !action.trim()) return res.status(400).json({ error: "행동을 입력하세요" });

    const outcome = await handleAction(sess, action.trim(), true, null);

    let event = null;
    if (state.alive) {
      event = await nextEvent(sess);
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
  const sess = sessions.get(req.query.sessionId);
  if (!sess) return res.status(404).json({ error: "세션 없음" });
  res.json({ state: publicState(sess.state), event: sess.state.pending });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LifeSim 2026 → http://localhost:${PORT}`);
});
