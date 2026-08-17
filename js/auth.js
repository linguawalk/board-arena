// auth.js
// 5개 게임(바둑/체스/장기/쇼기/샹치) 복기 페이지에서 공통으로 사용하는 로그인 + 크레딧 조회 모듈.
//
// 사용법 (각 게임 HTML 하단):
//   <script type="module">
//     import { ensureLogin, getIdToken, getCreditBalance, onAuthChange } from '/js/auth.js';
//     ...
//   </script>

import { auth, db } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();

/** 현재 로그인 상태를 반환. 로그인 안 되어 있으면 null. */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * 로그인 상태 변화를 구독. 페이지 로드 시 "로그인" 버튼 ↔ "프로필+크레딧" 표시를
 * 전환하는 용도로 사용.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * AI 해석 버튼을 눌렀을 때 호출. 로그인이 안 되어 있으면 Google 팝업을 띄우고,
 * 최초 로그인 시 users/{uid} 문서를 credits:0 으로 생성합니다.
 * (신규 유저 기본 크레딧을 주고 싶다면 아래 INITIAL_FREE_CREDITS 값을 조정하세요.)
 */
const INITIAL_FREE_CREDITS = 0;

export async function ensureLogin() {
  if (auth.currentUser) return auth.currentUser;

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      email: user.email,
      displayName: user.displayName,
      credits: INITIAL_FREE_CREDITS,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  return user;
}

export async function logout() {
  await signOut(auth);
}

/** 서버(/api/interpret)에 보낼 ID 토큰. 매 요청마다 새로 발급받아 만료를 피합니다. */
export async function getIdToken() {
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
  return await auth.currentUser.getIdToken(/* forceRefresh */ true);
}

/**
 * 현재 크레딧 잔액을 Firestore에서 직접 읽어옵니다.
 * (실제 차감은 서버에서만 일어나므로, 이 값은 "표시용 조회"일 뿐입니다.
 *  요청 성공/실패는 /api/interpret 응답의 remainingCredits를 신뢰하세요.)
 */
export async function getCreditBalance() {
  if (!auth.currentUser) return null;
  const userRef = doc(db, 'users', auth.currentUser.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return 0;
  return snap.data().credits ?? 0;
}
