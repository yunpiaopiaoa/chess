const PIECES = {
    'white': { 'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔' },
    'black': { 'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚' }
};

class ChessBoard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isFlipped = false;
        this.onSquareClick = null; // Callback: (r, c) => {}
    }

    setFlipped(flipped) {
        this.isFlipped = flipped;
    }

    /**
     * 核心渲染方法
     * @param {Array} grid 棋盘二维数组
     * @param {Object} state 包含 selected 和 pieceMovesCache 的状态对象
     */
    render(grid, state = {}) {
        if (!this.container || !grid || !grid.length) return;
        this.container.innerHTML = '';
        
        const rows = grid.length;
        const cols = grid[0].length;
        const { selected, pieceMovesCache, turnColor } = state;

        this.container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        this.container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        for (let rIndex = 0; rIndex < rows; rIndex++) {
            for (let cIndex = 0; cIndex < cols; cIndex++) {
                const r = this.isFlipped ? rows - 1 - rIndex : rIndex;
                const c = this.isFlipped ? cols - 1 - cIndex : cIndex;

                const sq = document.createElement('div');
                sq.className = `square ${(r + c) % 2 === 0 ? 'white' : 'black'}`;
                
                const p = grid[r][c];
                if (p) {
                    const s = document.createElement('span');
                    s.className = `piece ${p.color}`;
                    s.innerText = PIECES[p.color][p.type];
                    sq.appendChild(s);
                }

                // 渲染选中状态
                if (selected && selected.r === r && selected.c === c) {
                    sq.classList.add('selected');
                }

                // 渲染高亮提示
                if (selected) {
                    const moves = pieceMovesCache[`${selected.r},${selected.c}`] || [];
                    const pSel = grid[selected.r][selected.c];
                    const isOwn = turnColor ? (pSel && pSel.color === turnColor) : true;
                    
                    if (moves.some(m => m.end[0] === r && m.end[1] === c)) {
                        sq.classList.add(isOwn ? 'highlight' : 'highlight-enemy');
                    }
                }

                sq.onclick = () => {
                    if (this.onSquareClick) this.onSquareClick(r, c);
                };
                this.container.appendChild(sq);
            }
        }
    }

    static parseFEN(fen) {
        const placement = fen.split(' ')[0];
        const rowsArr = placement.split('/');
        const rowCount = rowsArr.length;
        
        let colCount = 0;
        for (const char of rowsArr[0]) {
            if (/\d/.test(char)) colCount += parseInt(char);
            else colCount++;
        }

        const grid = Array(rowCount).fill(null).map(() => Array(colCount).fill(null));
        rowsArr.forEach((rowStr, r) => {
            let c = 0;
            for (const char of rowStr) {
                if (/\d/.test(char)) {
                    c += parseInt(char);
                } else {
                    const color = char === char.toUpperCase() ? 'white' : 'black';
                    const type = char.toUpperCase();
                    grid[r][c] = { type, color };
                    c++;
                }
            }
        });
        return grid;
    }
}
