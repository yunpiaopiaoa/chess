class LiveController {
    constructor(board, roomId) {
        this.board = board;
        this.roomId = roomId;
        this.resetState();
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

    connect() {
        this.resetState();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/${this.roomId}`);
        
        UI.text('live-status-label', "连接中...");
        UI.color('live-status-label', "#f1c40f");
        
        this.ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'init' || msg.type === 'update') {
                const oldStatus = this.data ? this.data.status : 'ongoing';
                this.data = msg.state;
                this.pieceMovesCache = {};
                UI.text('room-id-label', this.roomId);
                if (msg.type === 'init') this.viewIdx = null;

                if (oldStatus === 'ongoing' && this.data.status !== 'ongoing') {
                    fetch(`/save/${this.roomId}?filename=${encodeURIComponent(window.getLocalTimestamp())}`, { method: 'POST' });
                }
                this.refreshUI();
            } else if (msg.type === 'piece_moves') {
                this.pieceMovesCache[`${msg.pos[0]},${msg.pos[1]}`] = msg.moves;
                this.refreshUI();
            } else if (msg.type === 'error') {
                window.showToast(msg.message, true);
            }
        };

        this.ws.onclose = () => {
            UI.text('live-status-label', "断开");
            UI.color('live-status-label', "#e74c3c");
            this.ws = null;
        };
    }

    handleSquareClick(r, c) {
        if (!this.data) return;

        const isHistory = this.viewIdx !== null && this.viewIdx < this.data.fen_history.length;
        const currentFen = isHistory ? this.data.fen_history[this.viewIdx] : this.data.fen_history[this.data.fen_history.length - 1];
        const grid = ChessBoard.parseFEN(currentFen);
        const p = grid[r][c];

        // 1. 尝试移动权限 (仅限实时对局模式)
        if (this.viewIdx === null && this.data.status === 'ongoing' && this.selected) {
            const ms = this.pieceMovesCache[`${this.selected.r},${this.selected.c}`] || [];
            const moveObj = ms.find(m => m.end[0] === r && m.end[1] === c);
            const selPiece = grid[this.selected.r][this.selected.c];

            if (moveObj && selPiece && selPiece.color === this.data.turn) {
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

        // 2. 选择/查询权限
        if (p) {
            if (this.selected && this.selected.r === r && this.selected.c === c) {
                this.selected = null;
            } else {
                this.selected = { r, c };
                if (isHistory) {
                    this.fetchAnalysis(currentFen, r, c);
                } else {
                    this.requestPieceMoves(r, c);
                }
            }
        } else {
            // 在历史视图点击空格不再弹出确认框，仅简单取消选中
            this.selected = null;
        }
        this.refreshUI();
    }

    requestPieceMoves(r, c) {
        const key = `${r},${c}`;
        if (!this.pieceMovesCache[key] && this.ws) {
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

    navStep(d) {
        if (!this.data) return;
        if (this.viewIdx === null) this.viewIdx = this.data.history.length;
        this.viewIdx = Math.max(0, Math.min(this.data.history.length, this.viewIdx + d));
        if (this.viewIdx === this.data.history.length) this.viewIdx = null;
        this.selected = null;
        this.pieceMovesCache = {};
        this.refreshUI();
    }

    undo() {
        window.askConfirm("撤销移动", "确定要撤销最后一步吗？", () => {
            this.pieceMovesCache = {};
            this.ws.send(JSON.stringify({ type: 'undo' }));
        });
    }

    refreshUI() {
        if (!this.data) return;
        const isHist = this.viewIdx !== null;
        const fen = isHist ? this.data.fen_history[this.viewIdx] : this.data.fen_history[this.data.fen_history.length - 1];
        
        this.board.render(ChessBoard.parseFEN(fen), {
            selected: this.selected,
            pieceMovesCache: this.pieceMovesCache,
            turnColor: isHist ? null : this.data.turn
        });

        window.renderHistory(document.getElementById('live-history'), this.data, this.viewIdx, true);

        const isOver = this.data.status !== 'ongoing';
        UI.text('live-status-label', isOver ? "对局结束" : "在线");
        UI.color('live-status-label', isOver ? "white" : "#2ecc71");
        UI.bg('live-status-label', isOver ? "#c0392b" : "#1a252f");
        
        let msg = "";
        if (isOver) {
            const m = this.data.status === 'draw' ? "平局" : (this.data.status === 'white_win' ? "白方胜利" : "黑方胜利");
            msg = `<b style="color:#e74c3c">游戏结束！${m}</b>`;
        } else if (isHist) {
            msg = "正在查看历史棋着";
        }
        UI.html('live-msg', msg);
        UI.show('btn-reset', isOver);
        UI.text('live-turn-label', this.data.turn === 'white' ? '白方' : '黑方');
    }
}
