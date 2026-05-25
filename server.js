// 정적 서빙 + OpenAI 내레이션 프록시. 게임 로직/상태/저장은 전부 클라이언트에 있다.
// 이 서버는 계산을 하지 않는다. (AI는 내레이터, 시스템(클라이언트 엔진)은 판정관)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function clientFor(apiKey) {
  const key = (apiKey && apiKey.trim()) || process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

app.post("/api/verify", async (req, res) => {
  try {
    const client = clientFor(req.body?.apiKey);
    if (!client) return res.status(400).json({ error: "API 키가 없습니다" });
    await client.chat.completions.create({
      model: req.body?.model || "gpt-4o",
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/narrate", async (req, res) => {
  try {
    const { apiKey, model, messages, json } = req.body || {};
    const client = clientFor(apiKey);
    if (!client) return res.status(400).json({ error: "API 키가 설정되지 않았습니다" });
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages 필요" });

    const r = await client.chat.completions.create({
      model: model || "gpt-4o",
      max_tokens: 700,
      temperature: 0.85,
      response_format: json ? { type: "json_object" } : undefined,
      messages,
    });
    res.json({ text: r.choices?.[0]?.message?.content || "" });
  } catch (e) {
    console.error("narrate 오류:", e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LifeSim AI → http://localhost:${PORT}`));
