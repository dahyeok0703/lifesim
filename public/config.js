// 앱 전역 설정. 이름/버전/저장키 등은 여기서만 바꾸면 됩니다.
export const CONFIG = {
  appName: "LifeSim AI",
  tagline: "한 사람의 인생을, 하루의 시간대마다 살아간다",
  version: "0.1.0",
  saveKey: "lifesim_ai_save_v1",
  aiKeyStorage: "lifesim_ai_key",
  aiModelStorage: "lifesim_ai_model",
  defaultModel: "gpt-4o",
  // AI는 내레이터일 뿐, 아래 값은 절대 AI가 바꾸지 않는다(시스템 전담).
  aiNeverControls: ["돈", "시간", "확률 판정", "상태 수치", "저장 데이터"],
};
