const PIECES = {
    'white': { 'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔' },
    'black': { 'P': '♟', 'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚' }
};

const ROOM_ID = new URLSearchParams(window.location.search).get('room') || 'default';
let ws = null;
let liveData = null;
let liveViewIdx = null;
let archiveData = null;
let archiveIdx = null;
let selected = null;
let pMove = null;
let currentView = 'home';

function showView(view) {
    currentView = view;
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    const navBtn = document.getElementById(`btn-nav-${view}`);
    if (navBtn) navBtn.classList.add('active');

    if (view === 'live' && !ws) connectWS();
    if (view === 'archive') loadArchiveList();
    
    // Reset view index when switching back to live
    if (view === 'live') liveViewIdx = null;
    refreshUI();
}

let lastMove = null;
let pieceMovesCache = {}; // 客户端缓存合法移动

function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${ROOM_ID}`);
    document.getElementById('live-status-label').innerText = "连接中...";
    
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'init' || msg.type === 'update') {
            liveData = msg.state;
            pieceMovesCache = {}; // 棋局变化，清空本地缓存
            document.getElementById('room-id-label').innerText = ROOM_ID;
            
            if (msg.type === 'init') liveViewIdx = null;
            refreshUI();
        } else if (msg.type === 'piece_moves') {
            // 收到后端计算的特定棋子合法移动
            const key = `${msg.pos[0]},${msg.pos[1]}`;
            pieceMovesCache[key] = msg.moves;
            refreshUI();
        } else if (msg.type === 'error') showToast(msg.message, true);
    };
    ws.onclose = () => { 
        document.getElementById('live-status-label').innerText = "断开"; 
        document.getElementById('live-status-label').style.color = "#e74c3c";
        ws = null; 
    };
}

function refreshUI() {
    // Live View
    if (liveData) {
        const lGrid = document.getElementById('live-board');
        const isHistoryView = liveViewIdx !== null && liveViewIdx < liveData.fen_history.length;
        
        // 核心彻底重构：完全通过 FEN 解析出当前棋盘
        const targetFEN = isHistoryView ? liveData.fen_history[liveViewIdx] : liveData.fen_history[liveData.fen_history.length - 1];
        const b = parseFENToGrid(targetFEN);
        
        renderBoard(lGrid, b, isHistoryView || liveData.game_over);
        renderHistory(document.getElementById('live-history'), liveData, liveViewIdx, true);
        
        const statusEl = document.getElementById('live-status-label');
        const msgEl = document.getElementById('live-msg');
        const resetBtn = document.getElementById('btn-reset');
        
        if (liveData.game_over) {
            statusEl.innerText = "对局结束";
            statusEl.style.background = "#c0392b";
            msgEl.innerHTML = `<b style="color:#e74c3c">游戏结束！${liveData.outcome || ''}</b>`;
            resetBtn.style.display = 'block';
        } else {
            statusEl.innerText = "在线";
            statusEl.style.background = "#1a252f";
            msgEl.innerText = isHistoryView ? "正在查看历史棋着" : "";
            resetBtn.style.display = 'none';
        }
        document.getElementById('live-turn-label').innerText = liveData.turn === 'white' ? '白方' : '黑方';
    }

    // Archive View
    const aGrid = document.getElementById('archive-board');
    if (archiveData) {
        const targetFEN = (archiveIdx !== null && archiveIdx < archiveData.fen_history.length) 
                        ? archiveData.fen_history[archiveIdx] 
                        : archiveData.fen_history[archiveData.fen_history.length - 1];
        const b = parseFENToGrid(targetFEN);
        renderBoard(aGrid, b, true);
        renderHistory(document.getElementById('archive-history'), archiveData, archiveIdx, false);
        document.getElementById('archive-step-info').innerText = `步数: ${archiveIdx || 0} / ${archiveData.history.length}`;
    } else {
        if (aGrid) aGrid.innerHTML = '';
    }
}

/**
 * 动态 FEN 解析器：自动适配棋盘维度
 */
function parseFENToGrid(fen) {
    const placement = fen.split(' ')[0];
    const rowsArr = placement.split('/');
    const rowCount = rowsArr.length;
    
    // 计算列数 (从第一行推导)
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

function renderBoard(container, grid, readOnly) {
    if (!container || !grid.length) return;
    container.innerHTML = '';
    const rows = grid.length;
    const cols = grid[0].length;

    // 动态调整 CSS Grid 布局以适配不同维度的棋盘
    container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sq = document.createElement('div');
            sq.className = `square ${(r + c) % 2 === 0 ? 'white' : 'black'}`;
            
            const p = grid[r][c];
            if (p) {
                const s = document.createElement('span');
                s.className = `piece ${p.color}`;
                s.innerText = PIECES[p.color][p.type];
                sq.appendChild(s);
            }

            if (!readOnly && selected && selected.r === r && selected.c === c) sq.classList.add('selected');
            if (!readOnly && selected) {
                const moves = pieceMovesCache[`${selected.r},${selected.c}`] || [];
                // 现在 moves 是对象列表 [{end: [r,c], type: '...'}]
                if (moves.some(m => m.end[0] === r && m.end[1] === c)) sq.classList.add('highlight');
            }

            sq.onclick = () => { if (!readOnly) onSqClick(r, c); };
            container.appendChild(sq);
        }
    }
}

function onSqClick(r, c) {
    if (!liveData || liveData.game_over || liveViewIdx !== null) {
        if (liveViewIdx !== null) {
            if (confirm("回到即时对局？")) {
                liveViewIdx = null;
                refreshUI();
            }
        }
        return;
    }

    const b = parseFENToGrid(liveData.fen_history[liveData.fen_history.length - 1]);
    const p = b[r][c];

    if (selected) {
        // 检查是否点击了已经缓存的合法移动
        const ms = pieceMovesCache[`${selected.r},${selected.c}`] || [];
        const moveObj = ms.find(m => m.end[0] === r && m.end[1] === c);
        
        if (moveObj) {
            // 执行移动逻辑... 
            // 利用后端返回的 type 直接判断，不再手动检查坐标和棋子类型
            if (moveObj.type === 'promotion') {
                pMove = { start: [selected.r, selected.c], end: [r, c] };
                document.getElementById('promotion-modal').style.display = 'flex';
            } else {
                ws.send(JSON.stringify({ type: 'move', start: [selected.r, selected.c], end: [r, c] }));
            }
            selected = null;
        } else {
            // 重新选择其他棋子或取消选择
            if (p && p.color === liveData.turn) {
                selected = { r, c };
                requestPieceMoves(r, c);
            } else {
                selected = null;
            }
        }
    } else {
        // 第一次点击：如果是己方棋子，则选中并请求合法移动
        if (p && p.color === liveData.turn) {
            selected = { r, c };
            requestPieceMoves(r, c);
        }
    }
    refreshUI();
}

/**
 * 向后端请求特定位置棋子的合法移动
 */
function requestPieceMoves(r, c) {
    const key = `${r},${c}`;
    if (!pieceMovesCache[key]) {
        ws.send(JSON.stringify({ type: 'get_moves', pos: [r, c] }));
    }
}

function renderHistory(el, state, active, isLive) {
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < state.history.length; i += 2) {
        const row = document.createElement('div'); row.className = 'history-row';
        const n = document.createElement('span'); n.className = 'move-num'; n.innerText = `${Math.floor(i/2)+1}.`;
        row.appendChild(n);
        row.appendChild(createMoveSpan(state.history[i], i+1, active, state, isLive));
        if (i+1 < state.history.length) row.appendChild(createMoveSpan(state.history[i+1], i+2, active, state, isLive));
        el.appendChild(row);
    }
    if (active === null) el.scrollTop = el.scrollHeight;
}

function createMoveSpan(txt, step, active, state, isLive) {
    const s = document.createElement('span');
    s.className = `move-val ${active === step ? 'active' : ''}`;
    s.innerText = txt;
    s.onclick = () => {
        if (isLive) {
            liveViewIdx = step;
        } else {
            archiveData = JSON.parse(JSON.stringify(state));
            archiveIdx = step;
        }
        refreshUI();
    };
    return s;
}

function navLiveStep(d) {
    if (!liveData) return;
    if (liveViewIdx === null) liveViewIdx = liveData.history.length;
    liveViewIdx = Math.max(0, Math.min(liveData.history.length, liveViewIdx + d));
    if (liveViewIdx === liveData.history.length) liveViewIdx = null; // Back to real-time
    refreshUI();
}

function navArchiveStep(d) {
    if (!archiveData) return;
    if (archiveIdx === null) archiveIdx = archiveData.history.length;
    archiveIdx = Math.max(0, Math.min(archiveData.history.length, archiveIdx + d));
    refreshUI();
}

async function saveCurrentGame() {
    const defaultName = `game_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}`;
    const input = document.getElementById('save-filename-input');
    input.value = defaultName;
    document.getElementById('save-modal').style.display = 'flex';
    input.focus();
    input.select();
}

function closeSaveModal() {
    document.getElementById('save-modal').style.display = 'none';
}

async function confirmSaveGame() {
    const filename = document.getElementById('save-filename-input').value.trim();
    if (!filename) return;

    closeSaveModal();
    const r = await fetch(`/save/${ROOM_ID}?filename=${encodeURIComponent(filename)}`, { method: 'POST' });
    const d = await r.json(); 
    if (d.error) showToast("保存失败: " + d.error, true);
    else showToast(d.message);
}

function showToast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.innerText = msg;
    el.className = 'toast' + (isError ? ' error' : '');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2500);
}

async function resetGame() {
    if (!confirm("确定要重新开始游戏吗？")) return;
    const r = await fetch(`/reset/${ROOM_ID}`, { method: 'POST' });
    const d = await r.json();
    console.log(d.message);
}

async function loadArchiveList() {
    const r = await fetch('/list_saved'); const d = await r.json();
    const s = document.getElementById('archive-select');
    if (!s) return;
    s.innerHTML = '<option value="">-- 选择存档棋谱 --</option>';
    d.games.forEach(g => s.innerHTML += `<option value="${g}">${g}</option>`);
}

async function loadSavedArchive() {
    const id = document.getElementById('archive-select').value;
    if (!id) return;
    const r = await fetch(`/load/${id}`);
    archiveData = await r.json(); archiveIdx = 0; refreshUI();
}

function confirmPromo(t) {
    ws.send(JSON.stringify({ type: 'move', ...pMove, promotion: t }));
    document.getElementById('promotion-modal').style.display = 'none';
    pMove = null;
}

// Init view
window.onload = () => {
    showView(new URLSearchParams(window.location.search).get('view') || 'home');
};
