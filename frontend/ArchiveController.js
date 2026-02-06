class ArchiveController {
    constructor(board) {
        this.board = board;
        this.data = null;
        this.viewIdx = 0;
        this.selected = null;
        this.pieceMovesCache = {};
    }

    async loadArchive(id) {
        if (!id) return;
        const r = await fetch(`/load/${id}`);
        this.data = await r.json();
        this.data.id = id;
        this.viewIdx = 0;
        this.selected = null;
        this.pieceMovesCache = {};
        this.refreshUI();
    }

    handleSquareClick(r, c) {
        if (!this.data) return;
        const fen = (this.viewIdx !== null && this.viewIdx < this.data.fen_history.length) 
                  ? this.data.fen_history[this.viewIdx] 
                  : this.data.fen_history[this.data.fen_history.length - 1];
        const grid = ChessBoard.parseFEN(fen);

        if (grid[r][c]) {
            if (this.selected && this.selected.r === r && this.selected.c === c) this.selected = null;
            else { this.selected = { r, c }; this.fetchAnalysis(fen, r, c); }
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
        .then(data => { this.pieceMovesCache[`${r},${c}`] = data.moves; this.refreshUI(); });
    }

    navStep(d) {
        if (!this.data) return;
        this.viewIdx = Math.max(0, Math.min(this.data.history.length, (this.viewIdx || 0) + d));
        this.selected = null;
        this.pieceMovesCache = {};
        this.refreshUI();
    }

    refreshUI() {
        if (!this.data) return;
        const fen = (this.viewIdx !== null && this.viewIdx < this.data.fen_history.length) 
                  ? this.data.fen_history[this.viewIdx] 
                  : this.data.fen_history[this.data.fen_history.length - 1];
        
        this.board.render(ChessBoard.parseFEN(fen), {
            selected: this.selected,
            pieceMovesCache: this.pieceMovesCache,
            turnColor: null
        });

        window.renderHistory(document.getElementById('archive-history'), this.data, this.viewIdx, false);
        UI.text('archive-name-label', this.data.id || "历史存档");
        UI.text('archive-step-info', `步数: ${this.viewIdx || 0} / ${this.data.history.length}`);
    }
}
