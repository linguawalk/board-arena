/**
 * board-core.js
 * 5개 보드게임(바둑/체스/장기/쇼기/샹치)이 공유하는 보드 추상 클래스
 *
 * - 교차점 기반(바둑/장기/샹치) vs 칸 기반(체스/쇼기) 모두 지원
 * - 바둑처럼 보드 크기가 가변인 게임을 위해 width/height를 항상 파라미터로 받음
 */

export const BOARD_KIND = {
  INTERSECTION: 'intersection', // 바둑, 장기, 샹치 - 선의 교차점에 착수
  SQUARE: 'square',             // 체스, 쇼기 - 칸 안에 기물 배치
};

export class BoardCore {
  /**
   * @param {Object} config
   * @param {string} config.kind - BOARD_KIND.INTERSECTION | BOARD_KIND.SQUARE
   * @param {number} config.width - 가로 칸/선 수
   * @param {number} config.height - 세로 칸/선 수
   * @param {HTMLElement} config.container - 보드를 렌더링할 DOM 컨테이너
   */
  constructor({ kind, width, height, container }) {
    if (!Object.values(BOARD_KIND).includes(kind)) {
      throw new Error(`Unknown board kind: ${kind}`);
    }
    this.kind = kind;
    this.width = width;
    this.height = height;
    this.container = container;

    // 상태: intersection 방식은 (width x height) 교차점, square 방식은 (width x height) 칸
    this.state = this._createEmptyState();

    // 착수/이동 히스토리 (복기용)
    this.history = [];
  }

  _createEmptyState() {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => null)
    );
  }

  /**
   * 보드 크기를 동적으로 변경 (바둑 9x9/13x13/15x15/19x19 전환용)
   * 하위 클래스는 이 메서드를 오버라이드해서 재렌더링 로직을 추가해야 함
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.state = this._createEmptyState();
    this.history = [];
    this.render();
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getCell(x, y) {
    if (!this.inBounds(x, y)) return undefined;
    return this.state[y][x];
  }

  setCell(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.state[y][x] = value;
  }

  /** 하위 클래스(go-board.js 등)에서 반드시 구현 */
  render() {
    throw new Error('render() must be implemented by subclass');
  }

  /** 하위 클래스에서 구현: 사용자 클릭 좌표 -> 게임 로직 연결 */
  handleInput(x, y) {
    throw new Error('handleInput() must be implemented by subclass');
  }

  /** 기보 export - 크기 정보를 반드시 포함해야 복기 시 재현 가능 */
  exportRecord() {
    return {
      kind: this.kind,
      width: this.width,
      height: this.height,
      history: this.history,
    };
  }
}
