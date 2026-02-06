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
        const r = await fetch('/archives');
        const d = await r.json();
        renderDashboard(d.games || []);
    } catch (e) {
        UI.html('dashboard-grid', '<div class="card-error">加载失败</div>');
    }
}

function renderDashboard(games) {
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = `<div class="game-card new-game"><div class="card-preview"><div class="card-icon">+</div></div><div class="card-title">新对局</div></div>`;
    
    grid.querySelector('.new-game .card-preview').onclick = () => {
        liveCtrl.resetState();
        showView('live');
        // 进入对局页后，connect 会建立连接并获取状态。
        // 如果想强制新对局，可以在这里设置标志或直接在 connect 时处理。
        // 由于进入房间默认获取当前状态，如果要“开启新对局”且房间已有状态，需要触发 reset。
        liveCtrl.connect('reset');
    };

    games.forEach(id => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `<div class="card-actions"><button class="action-btn btn-delete">×</button></div>
                        <div class="card-preview">
                            <img src="/thumbnails/${encodeURIComponent(id)}/preview.png" 
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                                 style="max-width:100%; max-height:100%; object-fit: contain; display:block;">
                            <div class="card-icon" style="display:none;">♟</div>
                        </div>
                        <div class="card-title"><span>${id}</span></div>`;

        card.querySelector('.btn-delete').onclick = async (e) => {
            e.stopPropagation();
            card.classList.add('removing');
            await new Promise(r => setTimeout(r, 300));
            const r = await fetch(`/archives/${encodeURIComponent(id)}`, { method: 'DELETE' });
            const d = await r.json();
            if (d.error) { UI.toast(d.error, true); card.classList.remove('removing'); }
            else { card.remove(); UI.toast("棋谱已删除"); }
        };
        card.querySelector('.card-preview').onclick = () => { showView('archive'); archiveCtrl.loadArchive(id); };
        grid.appendChild(card);
    });
}

// --- 暴露给 HTML 的桥接方法 ---

window.quitGame = async () => {
    // 如果对局正在进行中（且非空），弹出确认框询问是否保存
    if (liveCtrl.isOngoing() && !liveCtrl.canQuietlyExit()) {
        UI.flex('exit-modal', true);
    } else {
        // 如果对局已经结束，或者对局还没开始（空棋盘），直接执行退出
        // 对于已结束的对局，按照用户要求“主动退出对局都要自动保存”
        const needsSave = liveCtrl.data && liveCtrl.data.status !== 'ongoing' && !liveCtrl.canQuietlyExit();
        await performExit(needsSave);
    }
};

window.handleExitChoice = async (choice) => {
    UI.show('exit-modal', false);
    if (choice === 'save') await performExit(true);
    else if (choice === 'nosave') await performExit(false);
};

async function performExit(shouldSave) {
    if (shouldSave) {
        await saveCurrentGame(window.getLocalTimestamp());
        UI.toast("已自动保存并退出");
    }
    
    // 核心改进：如果对局已结束，退出前通过现有的 WebSocket 触发重置
    // 这样下次进入该房间时，就是新对局，避免“进入已结束房间”的尴尬
    if (liveCtrl.data && liveCtrl.data.status !== 'ongoing') {
        if (liveCtrl.ws && liveCtrl.ws.readyState === WebSocket.OPEN) {
            liveCtrl.ws.send(JSON.stringify({ type: 'reset' }));
        }
    }

    liveCtrl.resetState();
    showView('home', true);
}

async function saveCurrentGame(filename) {
    if (!liveCtrl || !liveCtrl.data) return;

    // 获取当前事实上的最新网格数据，而不是依赖 ChessBoard 内部可能未更新的 lastGrid
    const fenHistory = liveCtrl.data.fen_history;
    const latestFen = fenHistory[fenHistory.length - 1];
    const grid = ChessBoard.parseFEN(latestFen);

    let screenshot = "";
    if (chessBoard && typeof chessBoard.generateSnapshot === 'function') {
        // 显式传入网格数据进行截图
        const snapshotResult = chessBoard.generateSnapshot(grid);
        screenshot = (snapshotResult instanceof Promise) ? await snapshotResult : snapshotResult;
    } else {
        console.warn("无法生成快照：chessBoard 未就绪或版本过旧");
    }
    
    try {
        await fetch(`/archives/save/${ROOM_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, screenshot })
        });
        console.log("游戏已成功保存:", filename);
    } catch (e) {
        console.error("保存失败", e);
    }
}
window.saveCurrentGame = saveCurrentGame;

window.resetGame = async () => {
    const doReset = async () => {
        // 1. 如果有旧对局，先保存快照
        if (!liveCtrl.canQuietlyExit()) {
            await saveCurrentGame(window.getLocalTimestamp());
            UI.toast("上一局已存档");
        }
        
        // 2. 核心改进：优先通过现有的 WebSocket 发送重置指令 (保持长连接)
        if (liveCtrl.ws && liveCtrl.ws.readyState === WebSocket.OPEN) {
            liveCtrl.ws.send(JSON.stringify({ type: 'reset' }));
        } else {
            // 如果连接断开了，直接重新建立连接并带上重置标志
            liveCtrl.connect('reset');
        }
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
