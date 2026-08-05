/**
 * kifu-player.js
 * 저장된 수순(moves)을 초기 국면 위에 한 수씩 재생하는 컴포넌트.
 * 실제 바둑 규칙(tryPlaceStone)으로 시뮬레이션하기 때문에 따내기까지 정확히 재현되고,
 * 그 자체로 "왜 이 수가 좋은가"를 텍스트 없이도 보여줍니다:
 *   - 수순 번호를 돌 위에 표시
 *   - 관심 그룹을 자동 하이라이트
 *   - 따낸 돌은 실제로 사라지고, 방금 사라진 자리를 잠깐 X로 표시
 */
import { GoBoard } from '../../games/go/js/go-board.js';
import { STONE, tryPlaceStone } from '../../games/go/js/go-rules.js';

export class KifuPlayer {
  /**
   * @param {Object} config
   * @param {HTMLElement} config.container
   * @param {number} config.size
   * @param {Array<{x:number,y:number,color:string}>} config.initialStones
   * @param {Array<{x:number,y:number,color:string}>} config.moves - 순서대로 재생될 수들
   * @param {HTMLElement} [config.captionEl]
   * @param {Array<string>} [config.captions]
   * @param {Object} [config.viewRegion] - 특정 영역만 확대해서 보여줄 때
   * @param {Array<{x:number,y:number}>} [config.highlightCells] - 자동 하이라이트할 관심 그룹
   */
  constructor({
    container, size, initialStones, moves,
    captionEl = null, captions = [], viewRegion = null, highlightCells = [],
    onComplete = null, onStepChange = null, onCapture = null,
  }) {
    this.size = size;
    this.initialStones = initialStones;
    this.moves = moves;
    this.captionEl = captionEl;
    this.captions = captions;
    this.highlightCells = highlightCells;
    this.onComplete = onComplete;
    this.onStepChange = onStepChange;
    this.onCapture = onCapture;
    this.currentIndex = 0;
    this.playing = false;
    this.timer = null;

    this.board = new GoBoard({ container, size, interactive: false, viewRegion });
    this._renderStep();
  }

  _emptyGrid() {
    return Array.from({ length: this.size }, () => Array.from({ length: this.size }, () => null));
  }

  /** 0부터 targetIndex 직전까지 실제 규칙으로 재생한 결과 { grid, lastMove, lastCaptured } */
  _simulateUpTo(targetIndex) {
    let grid = this._emptyGrid();
    for (const s of this.initialStones) {
      grid[s.y][s.x] = s.color;
    }
    let koState = null;
    let lastMove = null;
    let lastCaptured = [];

    for (let i = 0; i < targetIndex; i++) {
      const mv = this.moves[i];
      const result = tryPlaceStone(grid, mv.x, mv.y, mv.color, this.size, this.size, koState);
      if (result.valid) {
        koState = grid;
        grid = result.nextState;
        lastMove = { x: mv.x, y: mv.y };
        lastCaptured = result.captured.map(([cx, cy]) => ({ x: cx, y: cy }));
      } else {
        grid[mv.y][mv.x] = mv.color;
        lastMove = { x: mv.x, y: mv.y };
        lastCaptured = [];
      }
    }
    return { grid, lastMove, lastCaptured };
  }

  _renderStep() {
    const { grid, lastMove, lastCaptured } = this._simulateUpTo(this.currentIndex);
    this.board.setState(grid, lastMove);

    const numberMap = new Map();
    for (let i = 0; i < this.currentIndex; i++) {
      const mv = this.moves[i];
      numberMap.set(`${mv.x},${mv.y}`, i + 1);
    }
    this.board.setMoveNumbers(numberMap);
    this.board.highlightGroup(this.highlightCells);
    this.board.markCapturedGhosts(this.currentIndex > 0 ? lastCaptured : []);
    if (this.currentIndex > 0 && lastCaptured.length > 0 && this.onCapture) {
      this.onCapture(lastCaptured);
    }

    if (this.captionEl) {
      const caption = this.currentIndex === 0 ? '초기 국면' : (this.captions[this.currentIndex - 1] || `${this.currentIndex}수째`);
      const captureNote = lastCaptured.length ? ` (${lastCaptured.length}점 따냄)` : '';
      this.captionEl.textContent = `${caption}${captureNote} (${this.currentIndex}/${this.moves.length})`;
    }

    if (this.onStepChange) this.onStepChange(this.currentIndex, this.moves.length);
  }

  next() {
    if (this.currentIndex < this.moves.length) {
      this.currentIndex++;
      this._renderStep();
      if (this.currentIndex === this.moves.length && this.onComplete) {
        this.onComplete();
      }
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
  loadSequence({ initialStones, moves, captions = [], highlightCells = null, onComplete = null, onCapture = null }) {
    this.pause();
    this.initialStones = initialStones;
    this.moves = moves;
    this.captions = captions;
    if (highlightCells) this.highlightCells = highlightCells;
    if (onComplete) this.onComplete = onComplete;
    if (onCapture) this.onCapture = onCapture;
    this.currentIndex = 0;
    this._renderStep();
  }
}
