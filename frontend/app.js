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
    
    // 核心改进：通过 uiMap 将 DOM ID 与逻辑分离
    liveCtrl = new LiveController(chessBoard, ROOM_ID, {
        container: 'view-live',
        historyBox: 'live-history',
        statusLabel: 'live-status-label',
        roomIdLabel: 'room-id-label',
        msgBox: 'live-msg',
        resetBtn: 'btn-reset',
        turnLabel: 'live-turn-label',
        flipBtn: 'btn-toggle-flip',
        undoBtn: 'btn-undo',
        quitBtn: 'btn-quit-game'
    });

    archiveCtrl = new ArchiveController(new ChessBoard('archive-board'), {
        container: 'view-archive',
        historyBox: 'archive-history',
        nameLabel: 'archive-name-label',
        stepLabel: 'archive-step-info',
        flipBtn: 'btn-toggle-flip-archive', // 假设 archive 也有自己的翻转按钮 ID
        backBtn: 'btn-back-home'
    });

    bindGlobalEvents();

    liveCtrl.promoter = (sr, sc, er, ec) => {
        promotionMove = { start: [sr, sc], end: [er, ec] };
        UI.flex('promotion-modal', true);
    };
    showView(new URLSearchParams(window.location.search).get('view') || 'home');
}

function bindGlobalEvents() {
    // 1. 退出确认弹窗按钮
    document.querySelectorAll('.btn-exit-choice').forEach(btn => {
        btn.onclick = () => handleExitChoice(btn.dataset.choice);
    });

    // 2. 通用确认弹窗按钮
    document.querySelectorAll('.btn-confirm').forEach(btn => {
        btn.onclick = () => closeConfirm(btn.dataset.ok === 'true');
    });

    // 3. 兵升变弹窗
    document.querySelectorAll('.promo-item').forEach(btn => {
        btn.onclick = () => {
            if (promotionMove && liveCtrl.ws) {
                liveCtrl.ws.send(JSON.stringify({ type: 'move', ...promotionMove, promotion: btn.dataset.piece }));
                UI.show('promotion-modal', false);
                promotionMove = null;
            }
        };
    });

    // 4. 其它全局按钮（翻转、撤销、退出）- 也可以通过 UI 映射在 Controller 中绑定，这里演示全局绑定
    const btnUndo = document.getElementById('btn-undo-move');
    if (btnUndo) btnUndo.onclick = () => liveCtrl.undo();

    const btnQuit = document.getElementById('btn-quit-game');
    if (btnQuit) btnQuit.onclick = () => quitGame();

    const btnReset = document.getElementById('btn-reset-game');
    if (btnReset) btnReset.onclick = () => resetGame();

    const btnFlipLive = document.getElementById('btn-toggle-flip');
    if (btnFlipLive) btnFlipLive.onclick = () => {
        liveCtrl.board.isFlipped = !liveCtrl.board.isFlipped;
        liveCtrl.refreshUI();
    };

    const btnFlipArchive = document.getElementById('btn-toggle-flip-archive');
    if (btnFlipArchive) btnFlipArchive.onclick = () => {
        archiveCtrl.board.isFlipped = !archiveCtrl.board.isFlipped;
        archiveCtrl.refreshUI();
    };

    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) btnBackHome.onclick = () => showView('home');
}

function showView(view, force = false, initAction = null) {
    if (!force && view !== 'live' && currentView === 'live' && liveCtrl.isOngoing() && !liveCtrl.canQuietlyExit()) {
        UI.toast("对局进行中，请先使用退出按钮", true);
        return;
    }
    currentView = view;
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) targetView.classList.add('active');

    if (view === 'live') {
        // 如果没有连接，或者有明确的初始化动作（如 reset），则建立连接
        if (!liveCtrl.ws || initAction) {
            liveCtrl.connect(initAction);
        }
        chessBoard.onSquareClick = (r, c) => liveCtrl.handleSquareClick(r, c);
        liveCtrl.refreshUI();
    } else if (view === 'archive') {
        archiveCtrl.board.onSquareClick = (r, c) => archiveCtrl.handleSquareClick(r, c);
        archiveCtrl.refreshUI();
    } else if (view === 'home') {
        loadDashboard();
    }
}
window.showView = showView; // 暴露给某些需要跳转的地方

/**
 * 加载仪表盘内容
 */
let dashboardDirty = true; // 标记仪表盘是否需要从后端刷新
async function loadDashboard() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    
    // 如果数据没有标记为脏且已经有内容（除了“新对局”卡片），则跳过请求
    if (!dashboardDirty && grid.children.length > 1) return;
    
    try {
        const r = await fetch('/archives');
        const d = await r.json();
        renderDashboard(d.games || []);
        dashboardDirty = false;
    } catch (e) {
        UI.html('dashboard-grid', '<div class="card-error">加载失败</div>');
    }
}

function renderDashboard(games) {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    // 1. 确保“新对局”按钮始终在第一位且不被重建
    let newGameCard = grid.querySelector('.game-card.new-game');
    if (!newGameCard) {
        newGameCard = document.createElement('div');
        newGameCard.className = 'game-card new-game';
        newGameCard.innerHTML = `<div class="card-preview"><div class="card-icon">+</div></div><div class="card-title">新对局</div>`;
        newGameCard.querySelector('.card-preview').onclick = () => showView('live', false, 'reset');
        grid.prepend(newGameCard);
    }

    // 2. 收集当前已存在的卡片 ID
    const existingCards = new Map();
    grid.querySelectorAll('.game-card[data-id]').forEach(card => {
        existingCards.set(card.dataset.id, card);
    });

    // 3. 按照服务器返回的 ID 列表顺序（最新在前/后）进行外科手术式更新
    // 我们直接使用 appendChild，因为它会自动移动现有的 DOM 节点而不会销毁它们
    // 这意味着 <img> 标签及其缓存状态将被完整保留。
    games.forEach(id => {
        let card = existingCards.get(id);
        if (!card) {
            // 只有全新的对局才创建新节点
            card = document.createElement('div');
            card.className = 'game-card';
            card.dataset.id = id;
            card.innerHTML = `
                <div class="card-actions"><button class="action-btn btn-delete">×</button></div>
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
                if (d.error) { 
                    UI.toast(d.error, true); 
                    card.classList.remove('removing'); 
                } else { 
                    card.remove(); 
                    UI.toast("棋谱已删除"); 
                }
            };
            card.querySelector('.card-preview').onclick = () => { showView('archive'); archiveCtrl.loadArchive(id); };
        }
        grid.appendChild(card);
    });

    // 4. 清理那些在服务器端已被删除但在前端还留着的卡片
    const gameIdsSet = new Set(games);
    existingCards.forEach((card, id) => {
        if (!gameIdsSet.has(id)) {
            card.remove();
        }
    });
}

// --- 辅助逻辑 ---

async function quitGame() {
    // 如果对局正在进行中（且非空），弹出确认框询问是否保存
    if (liveCtrl.isOngoing() && !liveCtrl.canQuietlyExit()) {
        UI.flex('exit-modal', true);
    } else {
        const needsSave = liveCtrl.data && liveCtrl.data.status !== 'ongoing' && !liveCtrl.canQuietlyExit();
        await performExit(needsSave);
    }
}
window.quitGame = quitGame;

async function handleExitChoice(choice) {
    UI.show('exit-modal', false);
    if (choice === 'save') await performExit(true);
    else if (choice === 'nosave') await performExit(false);
}

async function performExit(shouldSave) {
    if (shouldSave) {
        await saveCurrentGame(getLocalTimestamp());
        UI.toast("已自动保存并退出");
    }
    
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

    const fenHistory = liveCtrl.data.fen_history;
    const latestFen = fenHistory[fenHistory.length - 1];
    const grid = ChessBoard.parseFEN(latestFen);

    let screenshot = "";
    if (chessBoard && typeof chessBoard.generateSnapshot === 'function') {
        const snapshotResult = chessBoard.generateSnapshot(grid);
        screenshot = (snapshotResult instanceof Promise) ? await snapshotResult : snapshotResult;
    } 
    
    try {
        await fetch(`/archives/save/${ROOM_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, screenshot })
        });
        dashboardDirty = true; // 保存新对局后，标记仪表盘为脏，下次打开时更新列表
    } catch (e) {
        console.error("保存失败", e);
    }
}
window.saveCurrentGame = saveCurrentGame;

async function resetGame() {
    const doReset = async () => {
        if (!liveCtrl.canQuietlyExit()) {
            await saveCurrentGame(getLocalTimestamp());
            UI.toast("上一局已存档");
        }
        
        if (liveCtrl.ws && liveCtrl.ws.readyState === WebSocket.OPEN) {
            liveCtrl.ws.send(JSON.stringify({ type: 'reset' }));
        } else {
            liveCtrl.connect('reset');
        }
    };
    
    if (!liveCtrl.isOngoing() || liveCtrl.canQuietlyExit()) doReset();
    else askConfirm("重新开始", "确定要放弃当前对局并重新开始吗？", doReset);
}
window.resetGame = resetGame;

function getLocalTimestamp() {
    const n = new Date();
    const f = (v) => String(v).padStart(2, '0');
    return `${n.getFullYear()}-${f(n.getMonth()+1)}-${f(n.getDate())} ${f(n.getHours())}-${f(n.getMinutes())}-${f(n.getSeconds())}`;
}
window.getLocalTimestamp = getLocalTimestamp;

let confirmCallback = null;
function askConfirm(title, msg, onOk) {
    UI.text('confirm-title', title);
    UI.text('confirm-msg', msg);
    UI.flex('confirm-modal', true);
    confirmCallback = onOk;
}
window.askConfirm = askConfirm;

function closeConfirm(ok) {
    UI.show('confirm-modal', false);
    if (ok && confirmCallback) confirmCallback();
    confirmCallback = null;
}

window.showToast = (msg, err = false) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.innerText = msg;
    el.className = 'toast' + (err ? ' error' : '');
    UI.show('toast', true);
    setTimeout(() => UI.show('toast', false), 2500);
};

window.onload = initApp;
