class LiveController extends BaseChessController {
    constructor(board, roomId, uiMap) {
        super(board, uiMap);
        this.roomId = roomId;
        this.promoter = null;
        this.bindEvents();
    }

    bindEvents() {
        super.bindEvents();
        // 实时对局特有的监听已移至 app.js bindGlobalEvents 统一管理
    }

    resetState() {
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.data = null;
        this.viewIdx = null;
        this.selected = null;
        this.pieceMovesCache = {};
    }

    canQuietlyExit() {
        return !this.data || !this.data.history || this.data.history.length === 0;
    }

    isOngoing() {
        return this.data && this.data.status === 'ongoing';
    }

    connect(onOpenAction = null) {
        this.resetState();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${this.roomId}`);
        this.ws = ws;
        
        UI.text(this.uiMap.statusLabel, "连接中...");
        UI.color(this.uiMap.statusLabel, "#f1c40f");

        ws.onopen = () => {
            if (onOpenAction === 'reset') {
                ws.send(JSON.stringify({ type: 'reset' }));
            }
        };
        
        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'init' || msg.type === 'update') {
                this.data = msg.state;
                this.pieceMovesCache = {};
                this.selected = null;
                UI.text(this.uiMap.roomIdLabel, this.roomId);
                if (msg.type === 'init') this.viewIdx = null;
                this.refreshUI();
            } else if (msg.type === 'piece_moves') {
                this.pieceMovesCache[`${msg.pos[0]},${msg.pos[1]}`] = msg.moves;
                this.refreshUI();
            } else if (msg.type === 'error') {
                window.showToast(msg.message, true);
            }
        };

        ws.onclose = () => {
            if (this.ws === ws) {
                UI.text(this.uiMap.statusLabel, "断开");
                UI.color(this.uiMap.statusLabel, "#e74c3c");
                this.ws = null;
            }
        };
    }

    handleSquareClick(r, c) {
        const base = this.getBaseClickGrid();
        if (!base) return;
        const { grid, fen, isHist } = base;
        const p = grid[r][c];

        // 只有在实时对局（非历史回溯）且正在进行时才允许移动
        if (!isHist && this.isOngoing() && this.selected) {
            const moves = this.pieceMovesCache[`${this.selected.r},${this.selected.c}`] || [];
            const moveObj = moves.find(m => m.end[0] === r && m.end[1] === c);
            
            if (moveObj) {
                const selPiece = grid[this.selected.r][this.selected.c];
                if (selPiece && selPiece.color === this.data.turn) {
                    if (moveObj.type === 'promotion') {
                        if (this.promoter) this.promoter(this.selected.r, this.selected.c, r, c);
                    } else {
                        this.ws.send(JSON.stringify({ type: 'move', start: [this.selected.r, this.selected.c], end: [r, c] }));
                    }
                    this.selected = null;
                    this.refreshUI();
                    return;
                }
            }
        }

        if (p) {
            if (this.selected && this.selected.r === r && this.selected.c === c) {
                this.selected = null;
            } else {
                this.selected = { r, c };
                if (!isHist) this.requestPieceMoves(r, c);
                else this.fetchAnalysis(fen, r, c);
            }
        } else {
            this.selected = null;
        }
        this.refreshUI();
    }

    requestPieceMoves(r, c) {
        if (!this.pieceMovesCache[`${r},${c}`] && this.ws) {
            this.ws.send(JSON.stringify({ type: 'get_moves', pos: [r, c] }));
        }
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

    undo() {
        window.askConfirm("撤销移动", "确定要撤销最后一步吗？", () => {
            this.pieceMovesCache = {};
            if (this.ws) this.ws.send(JSON.stringify({ type: 'undo' }));
        });
    }

    refreshUI() {
        if (!this.data) return;
        const isHist = this.viewIdx !== null;
        
        // 1. 调用基类渲染核心棋盘和历史列表
        this.renderBoard(true, this.data.turn);

        // 2. 处理实时对局特有的状态展示逻辑
        const isOver = !this.isOngoing();
        UI.text(this.uiMap.statusLabel, isOver ? "对局结束" : "在线");
        UI.color(this.uiMap.statusLabel, isOver ? "white" : "#2ecc71");
        UI.bg(this.uiMap.statusLabel, isOver ? "#c0392b" : "#1a252f");
        
        let msg = "";
        if (isOver) {
            const m = this.data.status === 'draw' ? "平局" : (this.data.status === 'white_win' ? "白方胜利" : "黑方胜利");
            msg = `<b style="color:#e74c3c">游戏结束！${m}</b>`;
        } else if (isHist) {
            msg = "正在查看历史棋着";
        }
        UI.html(this.uiMap.msgBox, msg);
        UI.show(this.uiMap.resetBtn, isOver);
        UI.text(this.uiMap.turnLabel, this.data.turn === 'white' ? '白方' : '黑方');
    }
}
