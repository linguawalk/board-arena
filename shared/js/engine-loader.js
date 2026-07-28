/**
 * engine-loader.js
 * 5개 게임(바둑/체스/장기/쇼기/샹치)이 공유하는 엔진 로더.
 *
 * 목표: Stockfish/KataGo/Pikafish/YaneuraOu 등 엔진마다 구현이 달라도
 * 상위 코드(go-engine-adapter.js 등)에서는 동일한 인터페이스로 다루게 함.
 *
 * 실제 엔진(WASM)은 Web Worker 안에서 돌려서 메인 스레드(UI)가 멈추지 않게 한다.
 */

export class EngineLoader {
  /**
   * @param {Object} config
   * @param {string} config.workerUrl - 이 엔진을 감싸는 워커 스크립트 경로
   * @param {number} [config.timeoutMs] - 응답 대기 제한시간
   */
  constructor({ workerUrl, timeoutMs = 15000 }) {
    this.workerUrl = workerUrl;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.ready = false;
    this._pending = null; // 현재 대기 중인 요청 { resolve, reject, timer }
  }

  async load() {
    if (this.worker) return;
    this.worker = new Worker(this.workerUrl, { type: 'module' });

    await new Promise((resolve, reject) => {
      const onMessage = (e) => {
        if (e.data?.type === 'ready') {
          this.worker.removeEventListener('message', onMessage);
          this.ready = true;
          resolve();
        }
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', reject, { once: true });
    });
  }

  /**
   * 엔진에게 국면을 주고 다음 수를 요청.
   * @param {Object} payload - 엔진별로 형식이 다를 수 있음 (예: { board, color, level })
   * @returns {Promise<Object>} 엔진이 반환한 수 정보
   */
  requestMove(payload) {
    if (!this.worker || !this.ready) {
      return Promise.reject(new Error('Engine not loaded yet. Call load() first.'));
    }
    if (this._pending) {
      return Promise.reject(new Error('Previous request still pending.'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending = null;
        reject(new Error('Engine response timeout'));
      }, this.timeoutMs);

      const onMessage = (e) => {
        if (e.data?.type === 'move') {
          clearTimeout(timer);
          this.worker.removeEventListener('message', onMessage);
          this._pending = null;
          resolve(e.data.payload);
        }
      };

      this._pending = { resolve, reject, timer };
      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage({ type: 'requestMove', payload });
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }
}
