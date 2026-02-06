const PIECES = {
    'white': { 'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔' },
    'black': { 'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚' }
};

class ChessBoard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.isFlipped = false;
        this.onSquareClick = null; // Callback: (r, c) => {}

        // 核心修复：使用事件委托，不再在每次渲染时重复绑定事件
        if (this.container) {
            this.container.onclick = (e) => {
                const sq = e.target.closest('.square');
                if (sq && this.onSquareClick) {
                    const r = parseInt(sq.dataset.r);
                    const c = parseInt(sq.dataset.c);
                    this.onSquareClick(r, c);
                }
            };
        }
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
        this.lastGrid = grid; 
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
                // 将坐标存储在 dataset 中，供事件委托使用
                sq.dataset.r = r;
                sq.dataset.c = c;
                
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

    /**
     * 利用 SVG 模板生成高清快照 (Base64)
     * @param {Array} grid 要截图的棋盘网格数据 (如果不传则使用当前渲染的数据)
     */
    generateSnapshot(grid = null, size = 1024) {
        const targetGrid = grid || this.lastGrid;
        if (!targetGrid) return null;

        const rows = targetGrid.length;
        const cols = targetGrid[0].length;
        // 进一步加大棋盘占比到 98%，使边缘留白极小
        const baseSize = size * 0.98; 
        const sqSize = baseSize / Math.max(rows, cols);
        const boardWidth = sqSize * cols;
        const boardHeight = sqSize * rows;

        const COLORS = {
            whiteSq: '#ebecd0',
            blackSq: '#779556',
            whitePiece: '#ffffff',
            blackPiece: '#1a1a1a',
            bg: '#34495e'
        };

        // 构建 SVG 字符串
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            <defs>
                <filter id="whiteShadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="black" flood-opacity="0.9"/>
                </filter>
            </defs>`;
        
        // 1. 绘制背景
        svg += `<rect width="100%" height="100%" fill="${COLORS.bg}" />`;

        // 2. 绘制棋盘容器 (居中)
        const offsetLeft = (size - boardWidth) / 2;
        const offsetTop = (size - boardHeight) / 2;
        svg += `<g transform="translate(${offsetLeft}, ${offsetTop})">`;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const fill = (r + c) % 2 === 0 ? COLORS.whiteSq : COLORS.blackSq;
                svg += `<rect x="${c * sqSize}" y="${r * sqSize}" width="${sqSize}" height="${sqSize}" fill="${fill}" />`;

                const p = targetGrid[r][c];
                if (p) {
                    const glyphs = {
                        'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚'
                    };
                    const char = glyphs[p.type];
                    const fill = p.color === 'white' ? COLORS.whitePiece : COLORS.blackPiece;
                    const fontSize = sqSize * 0.82;
                    const centerX = (c + 0.5) * sqSize;
                    const centerY = (r + 0.5) * sqSize;
                    
                    // 白色棋子加上阴影滤镜，使其在白格上也清晰可见
                    const filter = p.color === 'white' ? 'filter="url(#whiteShadow)"' : '';
                    
                    svg += `<text x="${centerX}" y="${centerY}" fill="${fill}" ${filter}
                                 font-family="'Segoe UI Symbol', 'Apple Color Emoji', 'Arial Unicode MS', serif" 
                                 font-weight="bold" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">
                                 ${char}
                            </text>`;
                }
            }
        }
        svg += `</g></svg>`;

        // 将 SVG 转换为 PNG DataURL
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const img = new Image();
        const svgBlob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);

        return new Promise((resolve) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = url;
        });
    }
}
