from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Dict
import json
import os
from .logic.game import Game

app = FastAPI()

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载前端静态文件
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

# 简单的房间管理：key 为房间 ID, value 为游戏实例
games: Dict[str, Game] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_text(json.dumps(message))

manager = ConnectionManager()

@app.get("/")
def read_root():
    return FileResponse(os.path.join(frontend_path, "index.html"))

@app.post("/save/{room_id}")
async def save_game(room_id: str, filename: str = None):
    if room_id not in games:
        return {"error": "Room not found"}
    
    game = games[room_id]
    save_name = filename if filename else room_id
    
    # 确保保存目录存在
    os.makedirs("saved_games", exist_ok=True)
    
    # 获取完整状态进行保存
    state_dict = game.get_state_dict()
    
    # 统一保存为 JSON，作为持久化的唯一来源
    with open(f"saved_games/{save_name}.json", "w", encoding="utf-8") as f:
        json.dump(state_dict, f, indent=2, ensure_ascii=False)
    
    return {"message": f"游戏已成功保存为 {save_name}", "pgn": game.get_pgn()}

@app.get("/list_saved")
def list_saved():
    if not os.path.exists("saved_games"):
        return {"games": []}
    files = [f.replace(".json", "") for f in os.listdir("saved_games") if f.endswith(".json")]
    return {"games": files}

@app.get("/load/{game_id}")
def load_game(game_id: str):
    path = f"saved_games/{game_id}.json"
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Not found"}

@app.post("/reset/{room_id}")
async def reset_game(room_id: str):
    games[room_id] = Game()
    initial_state = games[room_id].get_state_dict()
    await manager.broadcast(room_id, {"type": "init", "state": initial_state})
    return {"message": "游戏已重置"}

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    
    # 初始化或获取游戏
    if room_id not in games:
        games[room_id] = Game()
    
    game = games[room_id]
    
    # 发送当前状态
    await websocket.send_text(json.dumps({
        "type": "init",
        "state": game.get_state_dict()
    }))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "move":
                start = tuple(message["start"])
                end = tuple(message["end"])
                promo = message.get("promotion")
                
                success, msg = game.make_move(start, end, promo)
                
                if success:
                    await manager.broadcast(room_id, {
                        "type": "update",
                        "state": game.get_state_dict(),
                        "last_move": {"start": start, "end": end}
                    })
                else:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": msg
                    }))
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
