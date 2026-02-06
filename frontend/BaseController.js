/**
 * BaseChessController
 * 抽象棋局控制基类：解决界面与逻辑的解耦
 * 它只负责“如何展示棋局状态”，而不关心数据是从 WebSoket 还是从磁盘加载的。
 */
class BaseChessController {
    constructor(board, uiMap) {
        this.board = board;
        this.uiMap = uiMap; // 包含所有需要的 DOM ID 映射
        
        this.data = null;
        this.viewIdx = null;
        this.selected = null;
        this.pieceMovesCache = {};
        
        // 自动将 controller 实例绑定到 board 的容器上，方便后续通过事件冒泡处理更多逻辑
    }

    /**
     * 获取辅助渲染的 UI 元素，实现解耦
     */
    getEl(key) {
        const id = this.uiMap[key];
        return id ? document.getElementById(id) : null;
    }

    /**
     * 获取当前查看时刻的棋盘数据 (历史或最新)
     */
    getBaseClickGrid() {
        if (!this.data || !this.data.fen_history) return null;
        const isHist = this.viewIdx !== null;
        const idx = isHist ? this.viewIdx : this.data.fen_history.length - 1;
        const fen = this.data.fen_history[idx];
        return { grid: ChessBoard.parseFEN(fen), fen, isHist };
    }

    /**
     * 通用的棋盘渲染调度
     */
    renderBoard(isLive, turnColor) {
        if (!this.data) return;
        const isHist = this.viewIdx !== null;
        const fen = isHist ? this.data.fen_history[this.viewIdx] : this.data.fen_history[this.data.fen_history.length - 1];
        
        this.board.render(ChessBoard.parseFEN(fen), {
            selected: this.selected,
            pieceMovesCache: this.pieceMovesCache,
            turnColor: !isHist ? turnColor : null
        });

        // 2. 渲染历史列表
        this.renderHistory(isLive);
    }

    /**
     * 渲染历史记录列表
     */
    renderHistory(isLive) {
        const el = this.getEl('historyBox');
        if (!el || !this.data) return;
        el.innerHTML = '';
        this.data.history.forEach((h, i) => {
            if (i % 2 === 0) {
                const row = document.createElement('div'); row.className = 'history-row';
                row.innerHTML = `<span class="move-num">${Math.floor(i/2)+1}.</span>`;
                row.appendChild(this.createHSpan(this.data.history[i], i+1, isLive));
                if (i+1 < this.data.history.length) row.appendChild(this.createHSpan(this.data.history[i+1], i+2, isLive));
                el.appendChild(row);
            }
        });
        if (this.viewIdx === null) el.scrollTop = el.scrollHeight;
    }

    createHSpan(txt, step, isLive) {
        const s = document.createElement('span');
        // 当前显示步数匹配时高亮
        const isActive = (this.viewIdx === step) || (step === this.data.history.length && this.viewIdx === null);
        s.className = `move-val ${isActive ? 'active' : ''}`;
        s.innerText = txt;
        s.onclick = () => {
            this.viewIdx = (isLive && step === this.data.history.length) ? null : step;
            this.selected = null;
            this.pieceMovesCache = {};
            this.refreshUI();
        };
        return s;
    }

    /**
     * 通用的历史步数导航逻辑
     */
    navStep(d) {
        if (!this.data) return;
        if (this.viewIdx === null) this.viewIdx = this.data.history.length;
        this.viewIdx = Math.max(0, Math.min(this.data.history.length, this.viewIdx + d));
        if (this.viewIdx === this.data.history.length) this.viewIdx = null;
        
        this.selected = null;
        this.pieceMovesCache = {};
        this.refreshUI();
    }

    /**
     * 通用的点击处理框架
     */
    /**
     * 初始化事件监听 - 解决与 HTML 的解耦
     */
    bindEvents() {
        // 1. 导航按钮
        const navs = this.getEl('container').querySelectorAll('.btn-nav');
        navs.forEach(btn => {
            btn.onclick = () => {
                const action = btn.dataset.action;
                if (action === 'nav-back') this.navStep(-1);
                if (action === 'nav-forward') this.navStep(1);
                if (action === 'nav-first') this.navStep(-100);
                if (action === 'nav-last') this.navStep(100);
            };
        });

        // 2. 翻转按钮
        const flipBtn = this.getEl('container').querySelector('#btn-toggle-flip');
        if (flipBtn) flipBtn.onclick = () => { this.board.isFlipped = !this.board.isFlipped; this.refreshUI(); };
    }
}
