/**
 * kifu-player.js
 * 저장된 수순(moves)을 초기 국면 위에 한 수씩 재생하는 컴포넌트.
 * GoBoard를 감싸서 자동재생 / 수동 넘기기(이전-다음) 둘 다 제공.
 *
 * 캡처(따내기) 로직은 재현하지 않고 단순히 돌을 누적 배치하는 방식이라,
 * 아주 짧은 설명용 수순(2~4수 내외)에 적합합니다.
 */
import { GoBoard } from '../../games/go/js/go-board.js';

export class KifuPlayer {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {number} config.size
   * @param {Array<{x:number,y:number,color:string}>} config.initialStones
   * @param {Array<{x:number,y:number,color:string}>} config.moves - 순서대로 추가될 수들
   * @param {HTMLElement} [config.captionEl] - 현재 단계 설명을 표시할 요소
   * @param {Array<string>} [config.captions] - 각 단계별 설명 문구 (moves와 같은 길이 또는 생략)
   */
  constructor({ container, size, initialStones, moves, captionEl = null, captions = [], viewRegion = null }) {
    this.size = size;
    this.initialStones = initialStones;
    this.moves = moves;
    this.captionEl = captionEl;
    this.captions = captions;
    this.currentIndex = 0; // 0 = 초기 국면, N = moves[0..N-1]까지 반영
    this.playing = false;
    this.timer = null;

    this.board = new GoBoard({ container, size, interactive: false, viewRegion });
    this._renderStep();
  }

  _cumulativeStones(uptoIndex) {
    const stones = this.initialStones.map((s) => ({ ...s }));
    for (let i = 0; i < uptoIndex; i++) {
      const mv = this.moves[i];
      stones.push({ x: mv.x, y: mv.y, color: mv.color });
    }
    return stones;
  }

  _renderStep() {
    this.board.loadPosition(this._cumulativeStones(this.currentIndex));
    if (this.currentIndex > 0) {
      const last = this.moves[this.currentIndex - 1];
      this.board.lastMove = { x: last.x, y: last.y };
      this.board.render();
    }
    if (this.captionEl) {
      const caption = this.currentIndex === 0
        ? (this.captions[-1] || '초기 국면')
        : (this.captions[this.currentIndex - 1] || `${this.currentIndex}수째`);
      this.captionEl.textContent = `${caption} (${this.currentIndex}/${this.moves.length})`;
    }
  }

  next() {
    if (this.currentIndex < this.moves.length) {
      this.currentIndex++;
      this._renderStep();
    } else {
      this.pause();
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this._renderStep();
    }
  }

  reset() {
    this.pause();
    this.currentIndex = 0;
    this._renderStep();
  }

  playAll(intervalMs = 900) {
    if (this.playing) return;
    this.playing = true;
    this.timer = setInterval(() => {
      if (this.currentIndex >= this.moves.length) {
        this.pause();
        return;
      }
      this.next();
    }, intervalMs);
  }

  pause() {
    this.playing = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 다른 수순으로 완전히 교체 (예: 정답 -> 오답 시도 전환) */
  loadSequence({ initialStones, moves, captions = [] }) {
    this.pause();
    this.initialStones = initialStones;
    this.moves = moves;
    this.captions = captions;
    this.currentIndex = 0;
    this._renderStep();
  }
}
