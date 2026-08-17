// firebase-init.js
// board-arena 전용 새 Firebase 프로젝트 설정을 여기에 채워넣으세요.
// Firebase 콘솔 → 프로젝트 설정 → 일반 → "내 앱" → SDK 설정 및 구성 에서 그대로 복사.
//
// mind-arena와는 별도 프로젝트이므로 여기 값은 mind-arena-2c240과 달라야 합니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
