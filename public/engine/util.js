// 공용 유틸 (순수 함수)
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const randf = (min, max) => Math.random() * (max - min) + min;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const round = (n) => Math.round(n);

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// 한국 원화 포맷
export function won(n) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(Math.round(n));
  return sign + a.toLocaleString("ko-KR") + "원";
}

// 부호 있는 델타 표시 (+1,000원 / -5)
export function signed(n, isMoney = false) {
  const s = n > 0 ? "+" : n < 0 ? "-" : "";
  const a = Math.abs(n);
  return s + (isMoney ? a.toLocaleString("ko-KR") + "원" : a);
}
