import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  createCharacter,
  applyEffects,
  advanceTime,
  checkDeath,
  pushChat,
  pushLog,
  fallbackChat,
  fallbackIntro,
  ageOf,
} from "./src/game.js";
import {
  makeClient,
  verifyClient,
  chatTurn,
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

    let intro = fallbackIntro(state);
    let suggestions = ["편의점 알바를 알아본다", "헬스장에 등록한다", "SNS에 일상을 올린다"];
    if (sess.client) {
      try {
        const r = await generateIntro(sess, state);
        if (r.intro) intro = r.intro;
        if (Array.isArray(r.suggestions)) suggestions = r.suggestions;
      } catch (e) {
        console.error("intro 생성 실패:", e.message);
      }
    }
    state.suggestions = suggestions;
    pushChat(state, "gm", intro);
    pushLog(state, intro);

    res.json({ sessionId: id, state: publicState(state), aiActive, aiError });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const sess = sessions.get(sessionId);
    if (!sess) return res.status(404).json({ error: "세션 없음" });
    const state = sess.state;
    if (!state.alive) return res.status(400).json({ error: "이미 사망했습니다" });
    if (!message || !message.trim()) return res.status(400).json({ error: "내용을 입력하세요" });

    const msg = message.trim();
    pushChat(state, "user", msg);

    let result;
    if (sess.client) {
      try {
        result = await chatTurn(sess, state, msg);
      } catch (e) {
        console.error("AI 응답 실패, 폴백:", e.message);
      }
    }
    if (!result || !result.reply) {
      result = fallbackChat(state, msg);
    }

    applyEffects(state, result.effects || {});
    const reply = result.reply;
    pushChat(state, "gm", reply);
    pushLog(state, reply);
    if (Array.isArray(result.suggestions)) state.suggestions = result.suggestions;

    advanceTime(state, result.age_months || 1);
    checkDeath(state);
    if (result.death && state.alive) {
      state.alive = false;
      state.causeOfDeath = result.death_reason || "예기치 못한 사고";
    }

    res.json({ state: publicState(state), reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/state", (req, res) => {
  const sess = sessions.get(req.query.sessionId);
  if (!sess) return res.status(404).json({ error: "세션 없음" });
  res.json({ state: publicState(sess.state) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LifeSim 2026 → http://localhost:${PORT}`);
});
