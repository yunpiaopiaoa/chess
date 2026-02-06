from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, Optional
import json
import os
import base64
import shutil
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

# 挂载存档目录以提供图片预览
os.makedirs("saved_games", exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory="saved_games"), name="thumbnails")

# 简单的房间管理：key 为房间 ID, value 为游戏实例
games: Dict[str, Game] = {}

class SaveGameRequest(BaseModel):
    filename: Optional[str] = ""
    screenshot: Optional[str] = ""  # Base64 字符串

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

@app.post("/archives/save/{room_id}")
async def save_game(room_id: str, request: SaveGameRequest):
    if room_id not in games:
        return {"error": "Room not found"}
    
    game = games[room_id]
    save_name = request.filename if request.filename else room_id
    
    # 创建对局专属目录
    game_dir = os.path.join("saved_games", save_name)
    os.makedirs(game_dir, exist_ok=True)
    
    # 获取完整状态进行保存
    state_dict = game.get_state_dict()
    
    # 保存 JSON
    json_path = os.path.join(game_dir, "game_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(state_dict, f, indent=2, ensure_ascii=False)

    # 处理并保存截图
    if request.screenshot:
        try:
            header, encoded = request.screenshot.split(",", 1)
            img_data = base64.b64decode(encoded)
            img_path = os.path.join(game_dir, "preview.png")
            with open(img_path, "wb") as f:
                f.write(img_data)
        except Exception as e:
            print(f"保存截图失败: {e}")
    
    return {"message": f"游戏已成功保存至目录 {save_name}"}

@app.get("/archives")
def list_saved():
    if not os.path.exists("saved_games"):
        return {"games": []}
    # 返回目录列表
    dirs = [d for d in os.listdir("saved_games") if os.path.isdir(os.path.join("saved_games", d))]
    return {"games": dirs}

@app.get("/archives/{game_id}")
def load_game(game_id: str):
    path = os.path.join("saved_games", game_id, "game_data.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "未找到存档"}, 404

@app.delete("/archives/{game_id}")
def delete_archive(game_id: str):
    game_dir = os.path.join("saved_games", game_id)
    if os.path.exists(game_dir):
        shutil.rmtree(game_dir)
        return {"message": "对局存档及预览图已完整删除"}
    return {"error": "未找到对局存档"}, 404

@app.post("/analyze")
async def analyze_position(data: dict):
    # 使用 Game 提供的静态分析工具，避免初始化整个 Game 实例
    moves = Game.get_moves_for_fen(data['fen'], tuple(data['pos']))
    return {
        "pos": data['pos'],
        "moves": [{"end": m.end, "type": m.move_type.value} for m in moves]
    }

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    
    # 初始化或获取游戏
    if room_id not in games:
        games[room_id] = Game()
    
    # 发送当前状态
    await websocket.send_text(json.dumps({
        "type": "init",
        "state": games[room_id].get_state_dict()
    }))

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 核心修复：每次操作都从全局 games 字典中动态获取实例。
            # 否则当 reset 请求替换了字典里的对象时，此处闭包引用的仍是旧对象。
            game = games.get(room_id)
            if not game:
                continue

            if message["type"] == "get_moves":
                pos = tuple(message["pos"])
                legal_moves = game.get_piece_legal_moves(pos)
                moves_data = [{"end": m.end, "type": m.move_type.value} for m in legal_moves]
                await websocket.send_text(json.dumps({
                    "type": "piece_moves",
                    "pos": pos,
                    "moves": moves_data
                }))
            
            elif message["type"] == "reset":
                # 核心改进：通过 WebSocket 直接触发重置，确保指令序列同步
                games[room_id] = Game()
                await manager.broadcast(room_id, {
                    "type": "init",
                    "state": games[room_id].get_state_dict()
                })

            elif message["type"] == "move":
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
            
            elif message["type"] == "undo":
                success, msg = game.undo_move()
                if success:
                    await manager.broadcast(room_id, {
                        "type": "update",
                        "state": game.get_state_dict()
                    })
                else:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": msg
                    }))
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
