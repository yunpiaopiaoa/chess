class ArchiveController extends BaseChessController {
    constructor(board, uiMap) {
        super(board, uiMap);
        this.cache = new Map(); // 内存缓存：存储已加载过的棋谱 JSON 数据
        this.bindEvents();
    }

    bindEvents() {
        super.bindEvents();
        // 存档研究特有的监听已移至 app.js bindGlobalEvents 统一管理
    }

    async loadArchive(id) {
        if (!id) return;
        
        let gameData;
        if (this.cache.has(id)) {
            // 如果缓存中有，直接使用，不再发起网络请求
            gameData = this.cache.get(id);
        } else {
            const r = await fetch(`/archives/${encodeURIComponent(id)}`);
            gameData = await r.json();
            this.cache.set(id, gameData); // 存入缓存
        }

        this.data = gameData;
        this.data.id = id;
        this.viewIdx = 0;
        this.selected = null;
        this.pieceMovesCache = {};
        this.refreshUI();
    }

    handleSquareClick(r, c) {
        const base = this.getBaseClickGrid();
        if (!base) return;
        const { grid, fen } = base;

        if (grid[r][c]) {
            if (this.selected && this.selected.r === r && this.selected.c === c) this.selected = null;
            else { 
                this.selected = { r, c }; 
                this.fetchAnalysis(fen, r, c); 
            }
        } else this.selected = null;
        this.refreshUI();
    }

    fetchAnalysis(fen, r, c) {
        fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, pos: [r, c] })
        })
        .then(res => res.json())
        .then(data => { 
            this.pieceMovesCache[`${r},${c}`] = data.moves; 
            this.refreshUI(); 
        });
    }

    refreshUI() {
        if (!this.data) return;
        
        // 1. 调用基类渲染
        this.renderBoard(false, null);

        // 2. 处理存档研究特有的 UI
        UI.text(this.uiMap.nameLabel, this.data.id || "历史存档");
        UI.text(this.uiMap.stepLabel, `步数: ${this.viewIdx || 0} / ${this.data.history.length}`);
    }
}
