const ROOM_ID = new URLSearchParams(window.location.search).get('room') || 'default';
let chessBoard, liveCtrl, archiveCtrl, currentView = 'home', promotionMove = null;

const UI = {
    text: (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; },
    html: (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; },
    color: (id, color) => { const el = document.getElementById(id); if (el) el.style.color = color; },
    show: (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; },
    flex: (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'flex' : 'none'; },
    bg: (id, bg) => { const el = document.getElementById(id); if (el) el.style.background = bg; },
    toast: (msg, err) => window.showToast(msg, err)
};

function initApp() {
    chessBoard = new ChessBoard('live-board');
    liveCtrl = new LiveController(chessBoard, ROOM_ID);
    archiveCtrl = new ArchiveController(new ChessBoard('archive-board'));
    liveCtrl.promoter = (sr, sc, er, ec) => {
        promotionMove = { start: [sr, sc], end: [er, ec] };
        UI.flex('promotion-modal', true);
    };
    showView(new URLSearchParams(window.location.search).get('view') || 'home');
}

function showView(view, force = false) {
    if (!force && view !== 'live' && currentView === 'live' && liveCtrl.isOngoing() && !liveCtrl.canQuietlyExit()) {
        UI.toast("对局进行中，请先使用退出按钮", true);
        return;
    }
    currentView = view;
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    if (view === 'live') {
        if (!liveCtrl.ws) liveCtrl.connect();
        chessBoard.onSquareClick = (r, c) => liveCtrl.handleSquareClick(r, c);
        liveCtrl.refreshUI();
    } else if (view === 'archive') {
        archiveCtrl.board.onSquareClick = (r, c) => archiveCtrl.handleSquareClick(r, c);
        archiveCtrl.refreshUI();
    } else if (view === 'home') loadDashboard();
}

/**
 * 加载仪表盘内容
 */
async function loadDashboard() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    UI.html('dashboard-grid', '<div style="color:#7f8c8d; grid-column: 1/-1; text-align:center; padding: 40px;">正在加载存档棋谱...</div>');
    try {
        const r = await fetch('/list_saved');
        const d = await r.json();
        renderDashboard(d.games || []);
    } catch (e) {
        UI.html('dashboard-grid', '<div class="card-error">加载失败</div>');
    }
}

function renderDashboard(games) {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = `<div class="game-card new-game"><div class="card-preview"><div class="card-icon">+</div></div><div class="card-title">新对局</div></div>`;
    
    grid.querySelector('.new-game .card-preview').onclick = async () => {
        liveCtrl.resetState();
        await fetch(`/reset/${ROOM_ID}`, { method: 'POST' });
        showView('live');
    };

    games.forEach(id => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `<div class="card-actions"><button class="action-btn btn-delete">×</button></div>
                        <div class="card-preview"><div class="card-icon">♟</div></div>
                        <div class="card-title"><span>${id}</span></div>`;

        card.querySelector('.btn-delete').onclick = async (e) => {
            e.stopPropagation();
            card.classList.add('removing');
            await new Promise(r => setTimeout(r, 300));
            const r = await fetch(`/delete_archive/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.error) { UI.toast(d.error, true); card.classList.remove('removing'); }
            else { card.remove(); UI.toast("棋谱已删除"); }
        };
        card.querySelector('.card-preview').onclick = () => { showView('archive'); archiveCtrl.loadArchive(id); };
        grid.appendChild(card);
    });
}

// --- 暴露给 HTML 的桥接方法 ---

window.quitGame = () => {
    if (liveCtrl.isOngoing() && !liveCtrl.canQuietlyExit()) UI.flex('exit-modal', true);
    else performExit(false);
};

window.handleExitChoice = (choice) => {
    UI.show('exit-modal', false);
    if (choice === 'save') performExit(true);
    else if (choice === 'nosave') performExit(false);
};

async function performExit(shouldSave) {
    if (shouldSave) {
        await fetch(`/save/${ROOM_ID}?filename=${encodeURIComponent(window.getLocalTimestamp())}`, { method: 'POST' });
        UI.toast("已自动保存并退出");
    }
    liveCtrl.resetState();
    showView('home', true);
}

window.resetGame = async () => {
    const doReset = async () => {
        if (!liveCtrl.canQuietlyExit()) await fetch(`/save/${ROOM_ID}?filename=${encodeURIComponent(window.getLocalTimestamp())}`, { method: 'POST' });
        await fetch(`/reset/${ROOM_ID}`, { method: 'POST' });
        liveCtrl.resetState();
    };
    if (!liveCtrl.isOngoing() || liveCtrl.canQuietlyExit()) doReset();
    else window.askConfirm("重新开始", "确定要放弃当前对局并重新开始吗？", doReset);
};

window.confirmPromo = (t) => {
    liveCtrl.ws.send(JSON.stringify({ type: 'move', ...promotionMove, promotion: t }));
    UI.show('promotion-modal', false);
    promotionMove = null;
};

window.getLocalTimestamp = () => {
    const n = new Date();
    const f = (v) => String(v).padStart(2, '0');
    return `${n.getFullYear()}-${f(n.getMonth()+1)}-${f(n.getDate())} ${f(n.getHours())}-${f(n.getMinutes())}-${f(n.getSeconds())}`;
};

let confirmCallback = null;
window.askConfirm = (title, msg, onOk) => {
    UI.text('confirm-title', title);
    UI.text('confirm-msg', msg);
    UI.flex('confirm-modal', true);
    confirmCallback = onOk;
};

window.closeConfirm = (ok) => {
    UI.show('confirm-modal', false);
    if (ok && confirmCallback) confirmCallback();
    confirmCallback = null;
};

window.showToast = (msg, err = false) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerText = msg;
    el.className = 'toast' + (err ? ' error' : '');
    UI.show('toast', true);
    setTimeout(() => UI.show('toast', false), 2500);
};

window.renderHistory = (el, state, active, isLive) => {
    if (!el || !state) return;
    el.innerHTML = '';
    state.history.forEach((h, i) => {
        if (i % 2 === 0) {
            const row = document.createElement('div'); row.className = 'history-row';
            row.innerHTML = `<span class="move-num">${Math.floor(i/2)+1}.</span>`;
            row.appendChild(createHSpan(state.history[i], i+1, active, state, isLive));
            if (i+1 < state.history.length) row.appendChild(createHSpan(state.history[i+1], i+2, active, state, isLive));
            el.appendChild(row);
        }
    });
    if (active === null) el.scrollTop = el.scrollHeight;
};

function createHSpan(txt, step, active, state, isLive) {
    const s = document.createElement('span');
    s.className = `move-val ${active === step ? 'active' : ''}`;
    s.innerText = txt;
    s.onclick = () => {
        const ctrl = isLive ? liveCtrl : archiveCtrl;
        ctrl.viewIdx = (isLive && step === state.history.length) ? null : step;
        ctrl.selected = null;
        ctrl.pieceMovesCache = {};
        ctrl.refreshUI();
    };
    return s;
}

window.navLiveStep = (d) => liveCtrl.navStep(d);
window.navArchiveStep = (d) => archiveCtrl.navStep(d);
window.undoMove = () => liveCtrl.undo();
window.toggleFlip = () => { const c = currentView === 'live' ? liveCtrl : archiveCtrl; c.board.isFlipped = !c.board.isFlipped; c.refreshUI(); };
window.showView = showView;
window.onload = initApp;
