import { CONFIG } from "./config.js";
import { Store } from "./store.js";
import { createGame, act, move, canDo, goalProgress } from "./engine/engine.js";
import { ACTIONS, ACTION_MAP, LOCATIONS, SCENARIOS, DIFFICULTIES, GOAL_DEFS, HOUSING } from "./engine/content.js";
import { STAT_GROUPS, netWorth, totalCash, monthlyFixedTotal, LOWER_IS_BETTER } from "./engine/state.js";
import { SLOTS, slotName, slotClock, dateKo, season, slotsLeft, daysLeftInMonth, weekday } from "./engine/time.js";
import { narrate, verifyKey, aiAvailable, guessAction } from "./ai.js";

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const won = (n) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ko-KR");

let S = null;
let nav = "진행";
let aiOn = false;
let busy = false;
let modalQueue = [];

/* =============== 초기화 =============== */
function init() {
  $("#brand").textContent = CONFIG.appName;
  $("#brand-tag").textContent = CONFIG.tagline;
  document.title = CONFIG.appName;

  // 시나리오/목표/난이도
  const sc = $("#f-scenario");
  sc.innerHTML = `<option value="">직접 설정</option>` + Object.keys(SCENARIOS).map((k) => `<option>${k}</option>`).join("");
  $("#f-goal").innerHTML = Object.keys(GOAL_DEFS).map((k) => `<option>${k}</option>`).join("");
  const seg = $("#f-difficulty");
  Object.keys(DIFFICULTIES).forEach((k, i) => {
    const b = el("button", i === 1 ? "active" : "", k);
    b.onclick = () => { [...seg.children].forEach((c) => c.classList.remove("active")); b.classList.add("active"); seg.dataset.val = k; };
    seg.appendChild(b);
  });
  seg.dataset.val = "보통";

  // 시나리오 선택 시 목표 자동
  sc.onchange = () => { const s = SCENARIOS[sc.value]; if (s?.goal) $("#f-goal").value = s.goal; };

  // AI 키 복원
  const k = Store.getKey();
  if (k) { $("#f-key").value = k; $("#f-remember").checked = true; $("#ai-box").open = true; }
  $("#f-model").value = Store.getModel();

  // 이어하기
  if (Store.has()) $("#continue-box").classList.remove("hidden");

  $("#btn-create").onclick = createFromForm;
  $("#btn-continue").onclick = () => { S = Store.load(); if (S) enterGame(false); };
  $("#btn-newgame-clear").onclick = () => { Store.clear(); $("#continue-box").classList.add("hidden"); };
  $("#btn-restart").onclick = () => { Store.clear(); location.reload(); };
}

async function createFromForm() {
  const btn = $("#btn-create");
  const apiKey = $("#f-key").value.trim();
  const model = $("#f-model").value;
  btn.disabled = true; btn.textContent = "준비 중…";

  if ($("#f-remember").checked && apiKey) Store.setKey(apiKey); else Store.setKey("");
  Store.setModel(model);

  if (apiKey) {
    try { await verifyKey(apiKey, model); }
    catch (e) { toast("AI 키 오류: 내장 내레이션으로 진행합니다"); Store.setKey(""); }
  }

  S = createGame({
    name: $("#f-name").value, age: $("#f-age").value, gender: $("#f-gender").value,
    region: $("#f-region").value, scenario: $("#f-scenario").value, goal: $("#f-goal").value,
    personality: $("#f-personality").value, background: $("#f-bg").value,
    difficulty: $("#f-difficulty").dataset.val,
  });
  // 도입 메시지
  S.chat.push({ role: "gm", text: introText(S), date: `${S.time.year}-${String(S.time.month).padStart(2,"0")}-${String(S.time.day).padStart(2,"0")} ${slotName(S.time.slot)}` });
  Store.save(S);
  btn.disabled = false; btn.textContent = "인생 시작";
  enterGame(true);
}

function introText(s) {
  return `${dateKo(s.time)} ${slotName(s.time.slot)}. ${s.character.region}, ${s.housing.type}.\n${s.character.name}(${s.character.age}세, ${s.character.job})의 하루가 시작된다. 목표는 '${s.goalTitle}'.\n무엇을 할지 행동을 고르거나 직접 입력하세요. 모든 선택은 시간·돈·체력·멘탈·관계에 영향을 줍니다.`;
}

function enterGame() {
  aiOn = aiAvailable();
  $("#screen-start").classList.remove("active");
  $("#screen-end").classList.remove("active");
  $("#screen-game").classList.add("active");
  const badge = $("#gh-ai");
  badge.textContent = aiOn ? "AI" : "내장";
  badge.className = "ai-badge " + (aiOn ? "on" : "off");
  buildNav();
  renderAll();
}

/* =============== 렌더 =============== */
function renderAll() { renderHeader(); renderStatus(); renderContent(); }

function renderHeader() {
  const t = S.time;
  $("#gh-date").textContent = `${dateKo(t)} · ${season(t.month)}`;
  $("#gh-slot").textContent = `${slotName(t.slot)} ${slotClock(t.slot)} · 남은 ${slotsLeft(S)}칸`;
  $("#gh-loc").textContent = S.location;
  const g = goalProgress(S);
  $("#gh-goal").textContent = S.goalTitle;
  $("#gh-goalbar").style.width = g.progress + "%";
  $("#gh-goalpct").textContent = g.progress + "%";
}

function statClass(path, val) {
  const lower = LOWER_IS_BETTER.has(path);
  if (lower) return val >= 80 ? "bad" : val >= 60 ? "warn" : "good";
  return val <= 20 ? "bad" : val <= 40 ? "warn" : "good";
}
function cardClass(path, val) {
  const lower = LOWER_IS_BETTER.has(path);
  if (lower) return val >= 85 ? "danger" : val >= 70 ? "warn" : "";
  return val <= 15 ? "danger" : val <= 35 ? "warn" : "";
}

function renderStatus() {
  const strip = $("#status-strip");
  const cash = totalCash(S);
  const cards = [
    { k: "보유금", v: won(cash) + "원", cls: cash < 100000 ? "danger" : cash < 300000 ? "warn" : "", vcls: "gold" },
    { k: "체력/피로", v: `${S.body.stamina}/${S.body.fatigue}`, cls: cardClass("body.fatigue", S.body.fatigue), vcls: statClass("body.fatigue", S.body.fatigue) },
    { k: "멘탈/스트레스", v: `${S.mind.mental}/${S.mind.stress}`, cls: cardClass("mind.stress", S.mind.stress), vcls: statClass("mind.stress", S.mind.stress) },
    { k: "건강", v: S.body.health, cls: cardClass("body.health", S.body.health), vcls: statClass("body.health", S.body.health) },
  ];
  strip.innerHTML = cards.map((c) => `<div class="sc ${c.cls}"><div class="k">${c.k}</div><div class="v ${c.vcls || ""}">${c.v}</div></div>`).join("");
}

function buildNav() {
  const items = [["진행", "💬"], ["상태", "📊"], ["관계", "👥"], ["목표", "🎯"], ["장소", "🗺️"], ["소지품", "🎒"], ["로그", "📜"], ["정산", "🧾"], ["설정", "⚙️"]];
  const n = $("#bottom-nav");
  n.innerHTML = "";
  for (const [name, ico] of items) {
    const b = el("button", name === nav ? "active" : "", `<span class="ni">${ico}</span>${name}`);
    b.onclick = () => { nav = name; buildNav(); renderContent(); };
    n.appendChild(b);
  }
}

function renderContent() {
  const c = $("#content");
  if (nav === "진행") return renderPlay(c);
  c.innerHTML = "";
  const p = el("div", "panel");
  c.appendChild(p);
  ({ 상태: renderStat, 관계: renderRel, 목표: renderGoal, 장소: renderPlaces, 소지품: renderItems, 로그: renderLog, 정산: renderSettle, 설정: renderSettings }[nav])(p);
}

/* ---- 진행(피드+행동) ---- */
function renderPlay(c) {
  c.innerHTML = "";
  const feed = el("div", "feed");
  for (const m of S.chat) feed.appendChild(msgEl(m));
  c.appendChild(feed);

  const pa = el("div", "play-actions");
  // 현위치 추천 행동
  const locActs = (LOCATIONS[S.location]?.actions || []);
  pa.appendChild(el("div", "sec-label", `📍 ${S.location}에서 할 수 있는 일`));
  const quick = el("div", "quick");
  for (const id of locActs) quick.appendChild(actBtn(id, true));
  c.appendChild(pa);
  pa.appendChild(quick);

  pa.appendChild(el("div", "sec-label", "전체 행동"));
  const grid = el("div", "act-grid");
  for (const a of ACTIONS) { if (a.freeform) continue; grid.appendChild(actBtn(a.id, false)); }
  pa.appendChild(grid);

  const free = el("div", "free-row");
  const inp = el("input"); inp.placeholder = "직접 행동 입력… (예: 도서관에서 3시간 공부한다)"; inp.maxLength = 120;
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submitFree(inp); });
  const sb = el("button", null, "▶"); sb.onclick = () => submitFree(inp);
  free.appendChild(inp); free.appendChild(sb);
  c.appendChild(free);

  feed.scrollTop = feed.scrollHeight;
}

function actBtn(id, quick) {
  const a = ACTION_MAP[id];
  const ok = canDo(S, id, a.needsNpc ? { npcId: "x" } : {}).ok || a.needsNpc;
  const b = el("button", quick ? "" : "act" + (ok ? "" : " disabled"),
    quick ? `${a.icon} ${a.label}` : `<span class="ico">${a.icon}</span>${a.label}`);
  b.onclick = () => onActionClick(id);
  b.title = (a.preview ? a.preview(S).join(" · ") : "");
  return b;
}

function msgEl(m) {
  const d = el("div", "msg " + (m.role || "gm"));
  let html = `<span class="md">${m.date || ""}</span>${escapeHtml(m.text)}`;
  if (m.tier) html += `<span class="tier ${m.tierCls || ""}">${m.tier}</span>`;
  if (m.chips?.length) html += `<div class="deltas">${m.chips.join("")}</div>`;
  d.innerHTML = html;
  return d;
}
function tierClass(tier) {
  if (tier === "대성공" || tier === "성공") return "good";
  if (tier === "부분 성공") return "warn";
  if (tier === "실패" || tier === "큰 실패") return "bad";
  return "";
}

/* ---- 행동 처리 ---- */
function onActionClick(id) {
  const a = ACTION_MAP[id];
  if (a.needsNpc) return openNpcPicker(id);
  doAction(id, {});
}

function submitFree(inp) {
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  const id = guessAction(text);
  if (id && ACTION_MAP[id].needsNpc) {
    // 자유입력 대화류: 가장 친한 NPC 자동 선택
    const n = [...S.npcs].sort((x, y) => y.affinity - x.affinity)[0];
    return doAction(id, { npcId: n?.id, npcName: n?.name, userInput: text });
  }
  doAction(id || "freeform", { userInput: text });
}

async function doAction(id, opts) {
  if (busy || !S.alive) return;
  const chk = canDo(S, id, opts);
  if (!chk.ok) return toast(chk.reason);
  busy = true;

  const a = ACTION_MAP[id];
  const userText = opts.userInput || `${a.icon} ${a.label}${opts.npcName ? ` — ${opts.npcName}` : ""}`;
  pushUser(userText);
  showTyping();

  // 한 프레임 양보 후 판정 (UI 반응성)
  await new Promise((r) => setTimeout(r, 10));
  const result = act(S, id, opts);
  if (result.blocked) { hideTyping(); busy = false; popLastUser(); return toast(result.reason); }

  let nar;
  try { nar = await narrate(S, result, opts.userInput || a.label); }
  catch { nar = { narration: result.logText, npcLine: "", suggestions: [] }; }
  hideTyping();

  pushGM(nar.narration, result);
  if (nar.npcLine) S.chat.push({ role: "npc", text: nar.npcLine, date: chatDate() });

  Store.save(S);
  renderAll();

  // 사건 선택지
  for (const ev of result.events || []) if (ev.choices) queueEventChoice(ev);
  // 정산 모달
  const st = result.settlements || {};
  if (st.daily) queueModal(summaryModal(st.daily, "daily"));
  if (st.weekly) queueModal(summaryModal(st.weekly, "weekly"));
  if (st.monthly) queueModal(summaryModal(st.monthly, "monthly"));
  flushModals();

  busy = false;
  if (!S.alive) return endGame();
}

function moveTo(loc) {
  if (busy) return;
  const r = move(S, loc);
  if (r.blocked) return toast(r.reason);
  S.chat.push({ role: "sys", text: `🚶 ${loc}(으)로 이동${r.fare ? ` (교통비 ${won(r.fare)}원)` : ""}`, date: chatDate() });
  Store.save(S);
  nav = "진행"; buildNav(); renderAll();
}

/* ---- 메시지 헬퍼 ---- */
function chatDate() { return `${S.time.year}-${String(S.time.month).padStart(2,"0")}-${String(S.time.day).padStart(2,"0")} ${slotName(S.time.slot)}`; }
function pushUser(text) { S.chat.push({ role: "user", text, date: chatDate() }); appendMsgLive(S.chat[S.chat.length - 1]); }
function popLastUser() { S.chat.pop(); renderContent(); }
function pushGM(text, result) {
  const chips = buildChips(result);
  const tier = result.tier === "수면" ? "" : result.tier;
  S.chat.push({ role: "gm", text, date: chatDate(), tier, tierCls: tierClass(tier), chips });
}
function appendMsgLive(m) {
  if (nav !== "진행") return;
  const feed = $(".feed"); if (!feed) return;
  feed.appendChild(msgEl(m)); feed.scrollTop = feed.scrollHeight;
}
function showTyping() {
  if (nav !== "진행") return;
  const feed = $(".feed"); if (!feed) return;
  const t = el("div", "typing"); t.id = "typing"; t.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span> 전개 중…`;
  feed.appendChild(t); feed.scrollTop = feed.scrollHeight;
}
function hideTyping() { $("#typing")?.remove(); }

function buildChips(r) {
  const chips = [];
  if (r.spend) chips.push(chip(`-${won(r.spend)}원`, "money"));
  if (r.earned) chips.push(chip(`+${won(r.earned)}원`, "money"));
  for (const [path, d] of Object.entries(r.applied || {})) {
    if (!d) continue;
    const good = (d > 0) !== LOWER_IS_BETTER.has(path);
    chips.push(chip(`${labelShort(path)} ${d > 0 ? "+" : ""}${d}`, good ? "up" : "down"));
  }
  if (r.sns) chips.push(chip(`팔로워 ${r.sns.followerDelta >= 0 ? "+" : ""}${r.sns.followerDelta}`, r.sns.followerDelta >= 0 ? "up" : "down"));
  if (r.npcChanges?.length) for (const c of r.npcChanges) chips.push(chip(`${c.name} 호감 ${c.affinity >= 0 ? "+" : ""}${c.affinity}`, c.affinity >= 0 ? "up" : "down"));
  return chips;
}
const chip = (t, cls) => `<span class="dchip ${cls}">${t}</span>`;
function labelShort(path) { return path.split(".").pop(); }

/* =============== 정보 탭 =============== */
function renderStat(p) {
  const c = S.character;
  p.appendChild(el("h2", null, `${c.name} · ${c.age}세 · ${c.gender}`));
  p.appendChild(kvBlock([
    ["거주지", `${c.region} / ${S.housing.type}`], ["직업", `${c.job} (${c.jobType})`], ["학력", c.education],
    ["인생 단계", c.lifeStage], ["성격", c.personality], ["현재 목표", S.goalTitle],
  ]));
  p.appendChild(el("div", "subhead", "💰 돈"));
  p.appendChild(kvBlock([
    ["현금", won(S.money.cash) + "원", "gold"], ["계좌잔고", won(S.money.bank) + "원", "gold"],
    ["부채", won(S.money.debt) + "원", S.money.debt > 0 ? "bad" : ""], ["순자산", won(netWorth(S)) + "원"],
    ["월수입", won(S.money.monthlyIncome) + "원", "good"], ["월 고정지출", won(monthlyFixedTotal(S)) + "원", "bad"],
    ["이번 달 변동지출", won(S.money.variableThisMonth) + "원"], ["신용점수", S.money.creditScore],
    ["월세/관리비", `${won(S.money.fixed.rent)} / ${won(S.money.fixed.maintenance)}`],
  ]));
  for (const [grp, def] of Object.entries(STAT_GROUPS)) {
    p.appendChild(el("div", "subhead", `${grp === "body" ? "🫀" : grp === "mind" ? "🧠" : grp === "skills" ? "⚡" : "🌐"} ${def.label}`));
    for (const [k, label] of Object.entries(def.keys)) {
      const v = S[grp][k]; if (v == null) continue;
      const path = `${grp}.${k}`;
      const lower = LOWER_IS_BETTER.has(path);
      const color = lower ? (v >= 70 ? "var(--bad)" : v >= 50 ? "var(--warn)" : "var(--good)") : (v <= 30 ? "var(--bad)" : v <= 50 ? "var(--warn)" : "var(--good)");
      p.appendChild(el("div", "statbar", `<div class="row"><span>${label}</span><span>${v}</span></div><div class="bar"><i style="width:${Math.min(100,v)}%;background:${color}"></i></div>`));
    }
  }
}

function renderRel(p) {
  p.appendChild(el("h2", null, "인간관계"));
  if (S.incoming) p.appendChild(el("div", "empty", `📩 ${S.incoming.name}에게서 연락이 와 있습니다. (진행 탭에서 확인)`));
  for (const n of S.npcs) {
    const node = el("div", "npc");
    node.innerHTML = `<div class="top"><span><span class="nm">${n.name}</span> <span class="rl">${n.role} · ${n.personality}</span></span><span class="rl">${n.relation}</span></div>
      <div class="minibars">
        ${mb("호감", n.affinity)}${mb("신뢰", n.trust)}${mb("친밀", n.intimacy)}${mb("의심", n.suspicion)}
      </div>
      ${n.memories[0] ? `<div class="mem">🧠 ${n.memories[0].text} (${n.memories[0].date})</div>` : ""}
      <div class="mem">💭 ${n.hiddenWorry}</div>`;
    p.appendChild(node);
  }
}
const mb = (l, v) => `<div class="mb">${l}<div class="bar"><i style="width:${v}%"></i></div>${v}</div>`;

function renderGoal(p) {
  p.appendChild(el("h2", null, "장기 목표"));
  const g = goalProgress(S);
  p.appendChild(el("div", "subhead", `${S.goalTitle} — ${g.progress}%`));
  p.appendChild(el("div", "statbar", `<div class="bar"><i style="width:${g.progress}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></i></div>`));
  p.appendChild(el("p", "empty", g.note || ""));
  p.appendChild(el("div", "subhead", "필요 조건"));
  for (const r of g.reqs) {
    p.appendChild(el("div", "kv", `<span class="k">${r.ok ? "✅" : "⬜"} ${r.label}</span><span class="v ${r.ok ? "good" : ""}">${fmtReq(r)}</span>`));
  }
  p.appendChild(el("div", "subhead", "현재 장애물"));
  p.appendChild(g.obstacles.length ? el("div", "chip-list", g.obstacles.map((o) => `<span class="chip">⚠️ ${o}</span>`).join("")) : el("div", "empty", "특별한 장애물 없음"));
}
function fmtReq(r) {
  const isMoney = r.label.includes("통장") || r.label.includes("부채") || r.label.includes("수입") || r.label.includes("현금");
  const c = isMoney ? won(r.cur) : r.cur, t = isMoney ? won(r.target) : r.target;
  return `${c} / ${r.op === "lte" ? "≤" : "≥"}${t}`;
}

function renderPlaces(p) {
  p.appendChild(el("h2", null, "장소 이동"));
  for (const [name, def] of Object.entries(LOCATIONS)) {
    const here = name === S.location;
    const acts = def.actions.map((id) => ACTION_MAP[id]?.label).filter(Boolean).join(", ");
    const node = el("div", "place" + (here ? " here" : ""));
    node.innerHTML = `<div><div class="pn">${name}${here ? " (현재)" : ""}</div><div class="pd">${acts}${def.move ? ` · 교통비 ${won(def.move)}원` : ""}</div></div>`;
    if (!here) { const b = el("button", null, "이동"); b.onclick = () => moveTo(name); node.appendChild(b); }
    p.appendChild(node);
  }
}

function renderItems(p) {
  p.appendChild(el("h2", null, "소지품 · 주거"));
  p.appendChild(el("div", "subhead", `🏠 ${S.housing.type}`));
  p.appendChild(el("p", "empty", HOUSING[S.housing.type]?.note || ""));
  p.appendChild(el("div", "subhead", "🎒 소지품"));
  if (!S.inventory.length) p.appendChild(el("div", "empty", "없음"));
  for (const it of S.inventory) p.appendChild(el("div", "kv", `<span class="k">${it.name}${it.monthly ? ` (이번 달 ${it.monthLeft > 0 ? "유효" : "만료"})` : ""}</span><span class="v">${it.note}</span>`));
}

function renderLog(p) {
  p.appendChild(el("h2", null, "사건 로그"));
  const list = el("ul", "loglist");
  for (const l of [...S.logs].reverse().slice(0, 120)) {
    list.appendChild(el("li", null, `<span class="tag">${l.type}</span><span class="lt">${l.date} ${l.slot}</span><br>${escapeHtml(l.text)}`));
  }
  p.appendChild(list);
}

function renderSettle(p) {
  p.appendChild(el("h2", null, "정산 기록"));
  const all = [...S.history.monthly.map((m) => ["월", m]), ...S.history.weekly.map((w) => ["주", w]), ...S.history.daily.map((d) => ["일", d])];
  if (!all.length) p.appendChild(el("div", "empty", "아직 정산 기록이 없습니다. 하루를 마치면(수면) 요약이 쌓입니다."));
  for (const [tag, h] of all.reverse().slice(0, 30)) {
    const node = el("div", "npc");
    node.innerHTML = `<div class="top"><span class="nm">${h.title}</span><span class="rl">${tag}</span></div>` + summaryBody(h);
    p.appendChild(node);
  }
}

function renderSettings(p) {
  p.appendChild(el("h2", null, "설정"));
  p.appendChild(el("div", "subhead", "AI 내레이션"));
  p.appendChild(el("p", "empty", aiOn ? "현재 AI 내레이션이 켜져 있습니다." : "현재 내장 내레이션으로 동작 중입니다. (돈·시간·수치는 항상 시스템이 계산)"));
  const keyInp = el("input"); keyInp.type = "password"; keyInp.placeholder = "sk-... (OpenAI 키)"; keyInp.value = Store.getKey();
  p.appendChild(labelWrap("API 키", keyInp));
  const modelSel = el("select"); modelSel.innerHTML = ["gpt-4o", "gpt-4o-mini", "gpt-4.1"].map((m) => `<option ${m === Store.getModel() ? "selected" : ""}>${m}</option>`).join("");
  p.appendChild(labelWrap("모델", modelSel));
  const saveBtn = el("button", "primary", "AI 설정 저장");
  saveBtn.onclick = async () => {
    const k = keyInp.value.trim();
    if (k) { try { await verifyKey(k, modelSel.value); Store.setKey(k); toast("AI 켜짐"); } catch { toast("키 오류"); return; } }
    else Store.setKey("");
    Store.setModel(modelSel.value); aiOn = aiAvailable();
    $("#gh-ai").textContent = aiOn ? "AI" : "내장"; $("#gh-ai").className = "ai-badge " + (aiOn ? "on" : "off");
  };
  p.appendChild(saveBtn);

  p.appendChild(el("div", "subhead", "저장"));
  const newBtn = el("button", "ghost", "새 인생 시작 (현재 저장 삭제)");
  newBtn.onclick = () => { if (confirm("현재 진행을 삭제하고 새로 시작할까요?")) { Store.clear(); location.reload(); } };
  p.appendChild(newBtn);
  p.appendChild(el("p", "empty", `${CONFIG.appName} v${CONFIG.version} · 진행은 이 브라우저에 자동 저장됩니다.`));
}

function labelWrap(text, node) { const l = el("label"); l.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);margin-bottom:12px"; l.appendChild(document.createTextNode(text)); l.appendChild(node); return l; }
function kvBlock(rows) { const d = el("div"); for (const [k, v, cls] of rows) d.appendChild(el("div", "kv", `<span class="k">${k}</span><span class="v ${cls || ""}">${v}</span>`)); return d; }

/* =============== 모달 =============== */
function queueModal(node) { modalQueue.push(node); }
function flushModals() {
  if (!modalQueue.length || $(".modal-bg")) return;
  const node = modalQueue.shift();
  const bg = el("div", "modal-bg");
  bg.appendChild(node);
  $("#modal-root").appendChild(bg);
}
function closeModal() { $(".modal-bg")?.remove(); renderAll(); flushModals(); }

function summaryModal(h, kind) {
  // 기록 보관
  if (kind === "daily") S.history.daily.push(h);
  if (kind === "weekly") S.history.weekly.push(h);
  if (kind === "monthly") S.history.monthly.push(h);
  Store.save(S);
  const m = el("div", "modal");
  m.innerHTML = `<h2>${kind === "monthly" ? "🧾" : kind === "weekly" ? "📅" : "🌙"} ${h.title}</h2>` + summaryBody(h);
  const row = el("div", "btn-row"); const b = el("button", "primary", "확인"); b.onclick = closeModal; row.appendChild(b);
  m.appendChild(row);
  return m;
}
function summaryBody(h) {
  let s = "";
  if (h.income != null) s += `<div class="kv"><span class="k">수입</span><span class="v good">${won(h.income)}원</span></div>`;
  if (h.fixed != null) s += `<div class="kv"><span class="k">고정지출</span><span class="v bad">${won(h.fixed)}원</span></div>`;
  if (h.variable != null) s += `<div class="kv"><span class="k">변동지출</span><span class="v">${won(h.variable)}원</span></div>`;
  if (h.net != null) s += `<div class="kv"><span class="k">순수지</span><span class="v ${h.net>=0?"good":"bad"}">${won(h.net)}원</span></div>`;
  if (h.creditScore != null) s += `<div class="kv"><span class="k">신용점수</span><span class="v">${h.creditScore}</span></div>`;
  if (h.changes?.length) {
    s += `<div class="subhead">변화</div><div class="deltas">` + h.changes.map((c) => `<span class="dchip ${c.delta>0 !== LOWER_IS_BETTER.has(moneyPath(c))?"up":"down"} ${c.money?"money":""}">${c.label} ${c.delta>0?"+":""}${c.money?won(c.delta)+"원":c.delta}</span>`).join("") + `</div>`;
  }
  if (h.acted?.length) s += `<div class="subhead">한 일</div><div class="empty">${h.acted.slice(0,8).map(escapeHtml).join("<br>")}</div>`;
  if (h.events?.length) s += `<div class="subhead">주요 사건</div><div class="empty">${h.events.map(escapeHtml).join("<br>")}</div>`;
  if (h.advice) s += `<div class="subhead">조언</div><div class="empty">${escapeHtml(h.advice)}</div>`;
  if (h.risk) s += `<div class="subhead">위험</div><div class="empty">${(Array.isArray(h.risk)?h.risk:[h.risk]).map(escapeHtml).join(", ")}</div>`;
  if (h.opportunity) s += `<div class="subhead">기회</div><div class="empty">${(Array.isArray(h.opportunity)?h.opportunity:[h.opportunity]).map(escapeHtml).join(", ")}</div>`;
  return s;
}
function moneyPath(c) { return c.key === "debt" ? "money.debt" : ""; }

function openNpcPicker(actionId) {
  const m = el("div", "modal");
  m.innerHTML = `<h2>${ACTION_MAP[actionId].label} — 상대 선택</h2>`;
  for (const n of S.npcs) {
    const b = el("button", "ghost", `${n.name} (${n.role}) · 호감 ${n.affinity}`);
    b.onclick = () => { closeModal(); doAction(actionId, { npcId: n.id, npcName: n.name }); };
    m.appendChild(b);
  }
  const row = el("div", "btn-row"); const cancel = el("button", "ghost", "취소"); cancel.onclick = closeModal; row.appendChild(cancel);
  m.appendChild(row);
  const bg = el("div", "modal-bg"); bg.appendChild(m); $("#modal-root").appendChild(bg);
}

function queueEventChoice(ev) {
  const m = el("div", "modal");
  m.innerHTML = `<h2>⚡ 사건</h2><p>${escapeHtml(ev.text)}</p>`;
  const row = el("div", "btn-row");
  ev.choices.forEach((ch, i) => {
    const b = el("button", i === 0 ? "ghost" : "primary", ch);
    b.onclick = () => { handleEventChoice(ev, i); closeModal(); };
    row.appendChild(b);
  });
  m.appendChild(row);
  queueModal(m);
}
function handleEventChoice(ev, idx) {
  if (ev.id === "scam" && idx === 1) {
    if (Math.random() < 0.5) { S.money.cash = Math.max(0, S.money.cash - 100000); S.mind.stress = Math.min(100, S.mind.stress + 12); S.chat.push({ role: "sys", text: "사기였다. 10만원을 잃었다.", date: chatDate() }); }
    else S.chat.push({ role: "sys", text: "수상해서 더 알아보다 발을 뺐다. 다행이다.", date: chatDate() });
    Store.save(S);
  }
}

/* =============== 종료 =============== */
function endGame() {
  $("#screen-game").classList.remove("active");
  $("#screen-end").classList.add("active");
  $("#end-summary").textContent = `${S.character.name} · ${S.character.age}세 · ${S.character.gender}\n사인: ${S.causeOfDeath}\n최종 순자산: ${won(netWorth(S))}원\n목표 '${S.goalTitle}' 진행률: ${goalProgress(S).progress}%`;
  $("#end-log").innerHTML = [...S.logs].reverse().slice(0, 40).map((l) => `<li><span class="lt">${l.date} ${l.slot}</span><br>${escapeHtml(l.text)}</li>`).join("");
  Store.clear();
}

/* =============== 유틸 =============== */
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2200);
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

init();
