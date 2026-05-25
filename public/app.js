const $ = (id) => document.getElementById(id);
let sessionId = null;
let state = null;
let activeTab = "자산";
let busy = false;

const STAT_META = {
  health: { label: "건강", color: "#3fb950" },
  happiness: { label: "행복", color: "#e3b341" },
  mental: { label: "정신력", color: "#7c5cff" },
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
function netWorth(s) { const f = s.finance; return f.cash + f.savings + f.investments - f.debt; }

async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "오류");
  return data;
}

/* ---------- 렌더링 ---------- */
function renderHeader() {
  $("g-name").textContent = state.name;
  const c = state.career;
  $("g-meta").textContent = `${state.gender} · ${state.age}세 · ${state.date.year}.${String(state.date.month).padStart(2,"0")} · ${c.job ? c.job : "무직"} · ${state.love.status}`;
  $("g-net").textContent = fmtMoney(netWorth(state));
}

function renderStats() {
  const el = $("g-stats"); el.innerHTML = "";
  for (const [k, m] of Object.entries(STAT_META)) {
    const v = state.stats[k];
    const d = document.createElement("div");
    d.className = "stat";
    d.innerHTML = `<div class="label">${m.label} <b>${v}</b></div><div class="bar"><i style="width:${v}%;background:${m.color}"></i></div>`;
    el.appendChild(d);
  }
}

function renderChat() {
  const el = $("chat-log");
  el.innerHTML = "";
  for (const m of state.chat) {
    const d = document.createElement("div");
    d.className = "msg " + (m.role === "user" ? "user" : "gm");
    d.innerHTML = `<span class="mdate">${m.date}</span>${escapeHtml(m.text)}`;
    el.appendChild(d);
  }
  el.scrollTop = el.scrollHeight;
}

function renderSuggestions() {
  const el = $("suggestions"); el.innerHTML = "";
  for (const s of state.suggestions || []) {
    const b = document.createElement("button");
    b.textContent = s;
    b.onclick = () => { $("chat-text").value = s; send(); };
    el.appendChild(b);
  }
}

function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

const TABS = ["자산", "학업", "일", "사랑", "SNS", "인간관계", "소지품", "일지"];

function renderTabs() {
  const nav = $("tabs"); nav.innerHTML = "";
  for (const t of TABS) {
    const b = document.createElement("button");
    b.textContent = t;
    b.className = t === activeTab ? "active" : "";
    b.onclick = () => { activeTab = t; renderTabs(); renderTabBody(); };
    nav.appendChild(b);
  }
}

function kv(k, v, cls = "") { return `<div class="kv"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`; }
function bar(label, v, max = 100) { return `<div class="kv"><span class="k">${label}</span><span class="v">${v}</span></div><div class="mini-bar"><i style="width:${Math.min(100, v/max*100)}%"></i></div>`; }

function renderTabBody() {
  const el = $("tab-body");
  const s = state;
  if (activeTab === "자산") {
    const f = s.finance;
    el.innerHTML =
      kv("순자산", fmtMoney(netWorth(s)), "gold") +
      `<div class="section-title">보유</div>` +
      kv("현금", fmtMoney(f.cash)) + kv("예금/적금", fmtMoney(f.savings)) + kv("투자 평가액", fmtMoney(f.investments)) +
      kv("빚", fmtMoney(f.debt), f.debt > 0 ? "bad" : "") +
      `<div class="section-title">월 현금흐름</div>` +
      kv("월수입", fmtMoney(f.monthlyIncome), "good") + kv("월지출", fmtMoney(f.monthlyExpense), "bad") +
      kv("월 수지", fmtMoney(f.monthlyIncome - f.monthlyExpense), f.monthlyIncome - f.monthlyExpense >= 0 ? "good" : "bad");
  } else if (activeTab === "학업") {
    const e = s.education;
    el.innerHTML =
      kv("최종 학력", e.level) + kv("상태", e.status) +
      kv("소속", e.school || "—") + kv("전공", e.major || "—") +
      kv("학점(GPA)", e.gpa ? e.gpa.toFixed(2) : "—") +
      `<div class="section-title">자격증</div>` +
      (e.certificates.length ? `<div class="chip-list">${e.certificates.map((c) => `<span class="chip">${c}</span>`).join("")}</div>` : `<div class="empty">아직 없음</div>`);
  } else if (activeTab === "일") {
    const c = s.career;
    el.innerHTML = c.job
      ? kv("직업", c.job) + kv("직장", c.company || "—") + kv("직급", c.position || "—") +
        kv("연봉", fmtMoney(c.salary), "gold") + kv("경력", c.yearsExperience.toFixed(1) + "년") +
        `<div class="section-title">직무 만족도</div>` + bar("만족도", c.satisfaction)
      : `<div class="empty">현재 무직 상태입니다. 채팅으로 "일자리를 알아본다" 같은 행동을 해보세요.</div>`;
  } else if (activeTab === "사랑") {
    const l = s.love;
    el.innerHTML = kv("관계 상태", l.status) + kv("결혼", l.married ? "기혼" : "미혼") +
      (l.partner ? `<div class="section-title">상대</div>` + kv("이름", l.partner.name) + bar("호감도", l.partner.affinity)
        : `<div class="empty">아직 인연이 없습니다. 채팅으로 만남을 시도해보세요.</div>`);
  } else if (activeTab === "SNS") {
    const sn = s.sns;
    el.innerHTML = kv("플랫폼", sn.platform) + kv("계정", sn.handle) +
      kv("팔로워", sn.followers.toLocaleString()) + kv("게시물", sn.posts) +
      `<div class="section-title">영향력</div>` + bar("영향력", sn.influence) +
      `<div class="section-title">최근 게시물</div>` +
      (sn.recentPosts && sn.recentPosts.length
        ? sn.recentPosts.map((p) => `<div class="post"><div class="pdate">${p.date}</div>${escapeHtml(p.text)}</div>`).join("")
        : `<div class="empty">아직 올린 글이 없습니다.</div>`);
  } else if (activeTab === "인간관계") {
    el.innerHTML = s.relationships.length
      ? s.relationships.map((r) => `<div class="list-row">${r.name} <span class="sub">${r.type}</span><div class="mini-bar"><i style="width:${r.closeness}%"></i></div></div>`).join("")
      : `<div class="empty">아직 관계가 없습니다.</div>`;
  } else if (activeTab === "소지품") {
    el.innerHTML =
      `<div class="section-title">소지품</div>` +
      (s.inventory.length ? s.inventory.map((i) => `<div class="list-row">${i.name}${i.note ? ` <span class="sub">${i.note}</span>` : ""}</div>`).join("") : `<div class="empty">없음</div>`) +
      `<div class="section-title">취미</div>` +
      (s.hobbies.length ? `<div class="chip-list">${s.hobbies.map((h) => `<span class="chip">${h}</span>`).join("")}</div>` : `<div class="empty">없음</div>`) +
      `<div class="section-title">특성</div>` +
      (s.traits.length ? `<div class="chip-list">${s.traits.map((t) => `<span class="chip">${t}</span>`).join("")}</div>` : `<div class="empty">없음</div>`);
  } else if (activeTab === "일지") {
    el.innerHTML = `<ul class="log">${[...s.log].reverse().map((l) => `<li><div class="ldate">${l.date} · ${l.age}세</div>${escapeHtml(l.text)}</li>`).join("")}</ul>`;
  }
}

function renderAll() {
  renderHeader(); renderStats(); renderSuggestions(); renderTabs(); renderTabBody();
}

/* ---------- 동작 ---------- */
async function start() {
  const btn = $("btn-start");
  const apiKey = $("in-key").value.trim();
  const model = $("in-model").value;
  btn.disabled = true; btn.textContent = apiKey ? "AI 준비 중…" : "생성 중…";

  if ($("in-remember").checked && apiKey) localStorage.setItem("lifesim_key", apiKey);
  else localStorage.removeItem("lifesim_key");
  localStorage.setItem("lifesim_model", model);

  try {
    const data = await api("/api/new", {
      name: $("in-name").value, gender: $("in-gender").value || undefined,
      age: Number($("in-age").value) || 20, background: $("in-bg").value || undefined,
      apiKey: apiKey || undefined, model,
    });
    sessionId = data.sessionId; state = data.state;
    if (data.aiError) alert(data.aiError);
    showScreen("game");
    const badge = $("g-ai-badge");
    badge.textContent = data.aiActive ? "AI 모드" : "폴백 모드";
    badge.className = "ai-badge " + (data.aiActive ? "on" : "off");
    renderChat(); renderAll();
    $("chat-text").focus();
  } catch (e) {
    alert("시작 실패: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = "인생 시작하기";
  }
}

function showTyping() {
  const el = $("chat-log");
  const d = document.createElement("div");
  d.className = "typing"; d.id = "typing";
  d.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span> 전개 중…`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}
function hideTyping() { const t = $("typing"); if (t) t.remove(); }

function appendMsg(role, text) {
  const el = $("chat-log");
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.innerHTML = `<span class="mdate">${state.date.year}.${String(state.date.month).padStart(2,"0")}</span>${escapeHtml(text)}`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}

async function send() {
  if (busy) return;
  const input = $("chat-text");
  const msg = input.value.trim();
  if (!msg) return;
  busy = true;
  input.value = "";
  $("chat-send").disabled = true;
  appendMsg("user", msg);
  showTyping();
  try {
    const data = await api("/api/chat", { sessionId, message: msg });
    state = data.state;
    hideTyping();
    if (!state.alive) { renderAll(); return endGame(); }
    renderChat(); renderAll();
  } catch (e) {
    hideTyping();
    appendMsg("gm", "⚠️ " + e.message);
  } finally {
    busy = false; $("chat-send").disabled = false; input.focus();
  }
}

function endGame() {
  showScreen("end");
  $("end-summary").textContent =
    `${state.name} · ${state.gender} · 향년 ${state.age}세\n사인: ${state.causeOfDeath}\n최종 순자산: ${fmtMoney(netWorth(state))}`;
  $("end-log").innerHTML = [...state.log].reverse().map((l) => `<li><div class="ldate">${l.date} · ${l.age}세</div>${escapeHtml(l.text)}</li>`).join("");
}

$("btn-start").onclick = start;
$("chat-send").onclick = send;
$("chat-text").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
$("btn-restart").onclick = () => location.reload();

(function restore() {
  const k = localStorage.getItem("lifesim_key");
  const m = localStorage.getItem("lifesim_model");
  if (k) { $("in-key").value = k; $("in-remember").checked = true; $("ai-box").open = true; }
  if (m) $("in-model").value = m;
})();
