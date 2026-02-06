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

    connect(onOpenAction = null) {
        this.resetState();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${this.roomId}`);
        this.ws = ws;
        
        UI.text('live-status-label', "连接中...");
        UI.color('live-status-label', "#f1c40f");

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
                this.selected = null; // 确保状态更新时清理选中
                UI.text('room-id-label', this.roomId);
                if (msg.type === 'init') this.viewIdx = null;

                // 先刷新 UI 以更新棋盘状态
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
                UI.text('live-status-label', "断开");
                UI.color('live-status-label', "#e74c3c");
                this.ws = null;
            }
        };
    }

    handleSquareClick(r, c) {
        if (!this.data) return;

        // 统一判断：只有当 viewIdx 为 null 时，才被视为正在进行的实时对局
        const isLive = this.viewIdx === null;
        const fen = isLive ? this.data.fen_history[this.data.fen_history.length - 1] : this.data.fen_history[this.viewIdx];
        const grid = ChessBoard.parseFEN(fen);
        const p = grid[r][c];

        // 1. 如果当前已经选中了一个棋子，且现在点击的是一个合法落点 -> 尝试移动
        if (isLive && this.data.status === 'ongoing' && this.selected) {
            const moves = this.pieceMovesCache[`${this.selected.r},${this.selected.c}`] || [];
            const moveObj = moves.find(m => m.end[0] === r && m.end[1] === c);
            
            if (moveObj) {
                // 仅当选中的棋子确实是当前回合方的棋子时发送移动请求
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

        // 2. 否则，视为选择棋子
        if (p) {
            if (this.selected && this.selected.r === r && this.selected.c === c) {
                this.selected = null;
            } else {
                this.selected = { r, c };
                if (isLive) {
                    this.requestPieceMoves(r, c);
                } else {
                    this.fetchAnalysis(fen, r, c);
                }
            }
        } else {
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
        
        // 统一判断逻辑
        const isLive = this.viewIdx === null;
        const fen = isLive ? this.data.fen_history[this.data.fen_history.length - 1] : this.data.fen_history[this.viewIdx];
        
        this.board.render(ChessBoard.parseFEN(fen), {
            selected: this.selected,
            pieceMovesCache: this.pieceMovesCache,
            turnColor: isLive ? this.data.turn : null
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
        } else if (!isLive) {
            msg = "正在查看历史棋着";
        }
        UI.html('live-msg', msg);
        UI.show('btn-reset', isOver);
        UI.text('live-turn-label', this.data.turn === 'white' ? '白方' : '黑方');
    }
}
