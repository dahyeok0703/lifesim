const $ = (id) => document.getElementById(id);
let sessionId = null;

const STAT_META = {
  health: { label: "건강", color: "#3fb950" },
  happiness: { label: "행복", color: "#e3b341" },
  intelligence: { label: "지능", color: "#4f9dff" },
  looks: { label: "외모", color: "#db61a2" },
  fitness: { label: "체력", color: "#f0883e" },
};

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("screen-" + name).classList.add("active");
}

function fmtMoney(n) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 100000000) return sign + (a / 100000000).toFixed(1) + "억원";
  if (a >= 10000) return sign + Math.round(a / 10000).toLocaleString() + "만원";
  return sign + a.toLocaleString() + "원";
}

function setLoading(on) {
  $("loading").classList.toggle("hidden", !on);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "오류");
  return data;
}

function renderStats(state) {
  const el = $("g-stats");
  el.innerHTML = "";
  for (const [key, meta] of Object.entries(STAT_META)) {
    const v = state.stats[key];
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<div class="label">${meta.label} <b>${v}</b></div>
      <div class="bar"><i style="width:${v}%;background:${meta.color}"></i></div>`;
    el.appendChild(d);
  }
}

function renderRels(state) {
  const el = $("g-rels");
  el.innerHTML = "";
  if (!state.relationships.length) { el.innerHTML = '<li class="rtype">아직 없음</li>'; return; }
  for (const r of state.relationships) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${r.name} <span class="rtype">${r.type}</span></span><span class="rclose">♥ ${r.closeness}</span>`;
    el.appendChild(li);
  }
}

function renderLog(state, targetId = "g-log") {
  const el = $(targetId);
  el.innerHTML = "";
  for (const l of [...state.log].reverse()) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="ldate">${l.date} · ${l.age}세</div>${l.text}`;
    el.appendChild(li);
  }
}

function renderHeader(state) {
  $("g-name").textContent = state.name;
  $("g-meta").textContent = `${state.gender} · ${state.age}세 · ${state.date.year}년 ${state.date.month}월 · ${state.job ? state.job.title : "무직"} · ${state.education}`;
  $("g-money").textContent = fmtMoney(state.money);
}

function renderEvent(event, outcome) {
  const box = $("outcome-box");
  if (outcome) { box.textContent = outcome; box.classList.remove("hidden"); }
  else box.classList.add("hidden");

  $("ev-title").textContent = event.title || "이번 달";
  $("ev-narrative").textContent = event.narrative || "";
  const ch = $("choices");
  ch.innerHTML = "";
  (event.choices || []).forEach((c, i) => {
    const b = document.createElement("button");
    b.textContent = c.label;
    b.onclick = () => choose(i);
    ch.appendChild(b);
  });
}

function renderAll(state) {
  renderHeader(state);
  renderStats(state);
  renderRels(state);
  renderLog(state);
}

function endGame(state) {
  showScreen("end");
  $("end-summary").textContent =
    `${state.name} · ${state.gender} · 향년 ${state.age}세\n사인: ${state.causeOfDeath}\n최종 자산: ${fmtMoney(state.money)}`;
  renderLog(state, "end-log");
}

async function start() {
  const btn = $("btn-start");
  const apiKey = $("in-key").value.trim();
  const model = $("in-model").value;
  btn.disabled = true; btn.textContent = apiKey ? "AI 준비 중…" : "생성 중…";

  // 키 기억하기
  if ($("in-remember").checked && apiKey) localStorage.setItem("lifesim_key", apiKey);
  else localStorage.removeItem("lifesim_key");
  localStorage.setItem("lifesim_model", model);

  try {
    const data = await api("/api/new", {
      name: $("in-name").value,
      gender: $("in-gender").value || undefined,
      age: Number($("in-age").value) || 18,
      background: $("in-bg").value || undefined,
      apiKey: apiKey || undefined,
      model,
    });
    sessionId = data.sessionId;
    if (data.aiError) alert(data.aiError);
    showScreen("game");
    renderAll(data.state);
    renderEvent(data.event, null);
    const badge = $("g-ai-badge");
    if (badge) {
      badge.textContent = data.aiActive ? "AI 모드" : "폴백 모드";
      badge.className = "ai-badge " + (data.aiActive ? "on" : "off");
    }
  } catch (e) {
    alert("시작 실패: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "인생 시작하기";
  }
}

async function choose(index) {
  setLoading(true);
  try {
    const data = await api("/api/choose", { sessionId, choiceIndex: index });
    renderAll(data.state);
    if (!data.state.alive) return endGame(data.state);
    renderEvent(data.event, data.outcome);
  } catch (e) {
    alert(e.message);
  } finally {
    setLoading(false);
  }
}

async function customAction() {
  const input = $("custom-input");
  const action = input.value.trim();
  if (!action) return;
  setLoading(true);
  try {
    const data = await api("/api/custom", { sessionId, action });
    input.value = "";
    renderAll(data.state);
    if (!data.state.alive) return endGame(data.state);
    renderEvent(data.event, data.outcome);
  } catch (e) {
    alert(e.message);
  } finally {
    setLoading(false);
  }
}

$("btn-start").onclick = start;
$("custom-btn").onclick = customAction;
$("custom-input").addEventListener("keydown", (e) => { if (e.key === "Enter") customAction(); });
$("btn-restart").onclick = () => location.reload();

// 저장된 키/모델 복원
(function restore() {
  const k = localStorage.getItem("lifesim_key");
  const m = localStorage.getItem("lifesim_model");
  if (k) {
    $("in-key").value = k;
    $("in-remember").checked = true;
    $("ai-box").open = true;
  }
  if (m) $("in-model").value = m;
})();
$("ai-status").textContent = "선택과 자유 행동으로 인생을 만들어 가세요.";
