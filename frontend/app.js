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

function connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/${ROOM_ID}`);
    document.getElementById('live-status-label').innerText = "连接中...";
    
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'init' || msg.type === 'update') {
            liveData = msg.state;
            document.getElementById('room-id-label').innerText = ROOM_ID;
            
            // Reset local view index if we receive an update and were at the end, 
            // or if it was a forceful init (reset)
            if (msg.type === 'init') liveViewIdx = null;
            
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
        const isHistoryView = liveViewIdx !== null && liveViewIdx < liveData.history.length;
        const b = isHistoryView ? liveData.snapshots[liveViewIdx] : liveData.board;
        
        renderBoard(lGrid, b, liveData.legal_moves, isHistoryView || liveData.game_over);
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
        const b = (archiveIdx !== null && archiveData.snapshots[archiveIdx]) ? archiveData.snapshots[archiveIdx] : archiveData.board;
        renderBoard(aGrid, b, {}, true);
        renderHistory(document.getElementById('archive-history'), archiveData, archiveIdx, false);
        document.getElementById('archive-step-info').innerText = `步数: ${archiveIdx || 0} / ${archiveData.history.length}`;
    } else {
        if (aGrid) aGrid.innerHTML = '';
    }
}

function renderBoard(container, grid, legals, readOnly) {
    if (!container) return;
    container.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
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
                const moves = legals[`${selected.r},${selected.c}`] || [];
                if (moves.some(m => m[0] === r && m[1] === c)) sq.classList.add('highlight');
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
    if (selected) {
        const ms = liveData.legal_moves[`${selected.r},${selected.c}`] || [];
        if (ms.some(m => m[0] === r && m[1] === c)) {
            if (liveData.board[selected.r][selected.c].type === 'P' && (r === 0 || r === 7)) {
                pMove = { start: [selected.r, selected.c], end: [r, c] };
                document.getElementById('promotion-modal').style.display = 'flex';
            } else {
                ws.send(JSON.stringify({ type: 'move', start: [selected.r, selected.c], end: [r, c] }));
            }
            selected = null;
        } else {
            const p = liveData.board[r][c];
            selected = (p && p.color === liveData.turn) ? {r, c} : null;
        }
    } else {
        const p = liveData.board[r][c];
        if (p && p.color === liveData.turn) selected = {r, c};
    }
    refreshUI();
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
