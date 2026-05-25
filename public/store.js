// 저장 계층. 지금은 localStorage. 나중에 Supabase 등으로 바꾸려면 이 파일만 교체하면 됨.
import { CONFIG } from "./config.js";

export const Store = {
  save(state) {
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(state)); return true; }
    catch (e) { console.error("저장 실패", e); return false; }
  },
  load() {
    try { const raw = localStorage.getItem(CONFIG.saveKey); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  },
  clear() { localStorage.removeItem(CONFIG.saveKey); },
  has() { return !!localStorage.getItem(CONFIG.saveKey); },

  // AI 설정
  getKey() { return localStorage.getItem(CONFIG.aiKeyStorage) || ""; },
  setKey(k) { if (k) localStorage.setItem(CONFIG.aiKeyStorage, k); else localStorage.removeItem(CONFIG.aiKeyStorage); },
  getModel() { return localStorage.getItem(CONFIG.aiModelStorage) || CONFIG.defaultModel; },
  setModel(m) { localStorage.setItem(CONFIG.aiModelStorage, m); },
};
