# Chess System - 国际象棋对战与研究系统

> **📢 声明**：本项目及其所有相关文档（包括本 README）均为 GitHub Copilot 辅助生成。

这是一个功能齐全、支持本地对战以及历史棋谱研究的国际象棋 Web 应用。项目采用前后端分离架构，核心逻辑由 Python 编写，界面采用现代 Vanilla JS 构建。
![alt text](asserts\image-1.png)
![alt text](asserts\image.png)
## 🌟 核心功能

- **本地对弈**：支持双方在同一设备上进行交替行棋对战。
- **完整国际象棋规则**：
  - 支持所有标准移动规则。
  - 特殊着法：合法易位（Castling）、吃过路兵（En Passant）、兵的升变（Promotion）。
  - 合法性校验：严格计算每个棋子的合法落位，包括解除将军状态的要求。
- **棋谱存档与研究**：
  - **存档管理**：支持将对局保存为本地 JSON 文件，可对存档进行重命名或删除。
  - **自动截图**：保存棋谱时，前端会自动生成当前棋盘的快照图片，作为存档列表的预览图。
  - **棋谱复盘**：可加载历史存档，支持通过导航按钮前后回溯每一步移动，方便分析对局。
- **多功能交互界面**：
  - **棋盘翻转**：支持旋转视角，方便黑白双方视角切换。
  - **撤销移动**：在对局中支持回滚操作。
  - **历史记录**：侧边栏实时显示 SAN 格式（标准代数记谱法）的移动历史。
  - **动态提示**：选中棋子时高亮显示所有合法落点。

## 🛠️ 技术栈

- **后端 (Backend)**: 
  - [FastAPI](https://fastapi.tiangolo.com/): 高性能异步 Python Web 框架，处理路由与数据持久化。
  - [Uvicorn](https://www.uvicorn.org/): ASGI 服务器。
  - [Python 3.10+](https://www.python.org/): 利用类型提示与解构增强逻辑严谨性。
- **前端 (Frontend)**: 
  - **HTML5/CSS3**: 响应式设计，使用 Flexbox 与 Grid 布局。
  - **Vanilla JavaScript (ES6+)**: 模块化开发（ChessBoard, LiveController, ArchiveController）。

## 📂 项目结构

```text
├── backend/                # 后端源码
│   ├── app.py              # FastAPI 启动程序、API 接口
│   ├── logic/              # 核心象棋引擎
│   │   ├── board.py        # 棋盘状态管理
│   │   ├── game.py         # 游戏流程控制
│   │   ├── piece.py        # 棋子类定义
│   │   ├── rules.py        # 核心移动规则校验
│   │   ├── move.py         # 移动单元封装
│   │   └── notation.py     # FEN/SAN 记谱法处理
│   └── data/               # 固定配置信息
├── frontend/               # 前端静态资源
│   ├── index.html          # 主界面
│   ├── app.js              # 核心 UI 调度中心
│   ├── ChessBoard.js       # 棋盘组件（渲染与交互逻辑）
│   ├── LiveController.js   # 正在对局逻辑控制
│   └── ArchiveController.js # 复盘分析逻辑控制
├── saved_games/            # 对局存档目录（每局拥有独立文件夹，包含 JSON 数据与预览 PNG）
├── tests/                  # 逻辑单元测试与可视化测试
├── run_server.py           # 简易服务器启动脚本
└── pyproject.toml / requirements.txt # 项目依赖
```

## 🚀 快速开始

### 1. 环境准备
确保已安装 Python 3.10 或更高版本。

### 2. 安装依赖
```bash
pip install -r requirements.txt
```

### 3. 启动项目
运行根目录下的启动脚本：
```bash
python run_server.py
```
默认情况下，服务器将在 `http://127.0.0.1:8000` 启动。

### 4. 访问应用
由于 `app.py` 中挂载了静态文件目录，直接在浏览器中打开 `http://127.0.0.1:8000` 即可开始游戏。

## 📡 通信架构与开发教训

在项目迭代过程中，我们从最初的混合模式逐步优化为职责清晰的 **HTTP + WebSocket** 双轨架构。

### 1. 接口分配原则
- **HTTP (RESTful)**：处理**持久化、静态数据和无状态分析**。
  - `GET /list_saved`: 拉取存档列表。
  - `GET /load/{id}`: 读取特定历史棋谱。
  - `POST /save/{id}`: 持久化存储当前对局及生成的截图（由于数据体积大，HTTP POST 承载更稳定）。
  - `DELETE /delete_archive/{id}`: 清理磁盘存档。
  - `POST /analyze`: 无状态的静态位置分析。
- **WebSocket (Real-time)**：处理**对局实时交互与状态同步**。
  - `move`, `undo`, `reset`, `get_moves`: 所有的游戏交互指令均通过 WS 发送，确保在单一消息流中按顺序执行。

### 2. 核心避坑指南 (Lessons Learned)
- **指令序列同步**：不要将“状态改变”分散在 HTTP 和 WS 两个通道。将 `reset` 移入 WS 解决了由于网络延迟导致的“旧指令应用到新对局”的问题。
- **动态对象绑定**：在 WebSocket 循环内部，每次处理消息前都应重新从全局缓存中检索 `Game` 实例。因为 `reset` 操作会替换字典中的对象，固守局部变量会导致逻辑操作到“僵尸对象”上。
- **渲染与快照时序**：自动截图必须在 UI 完成终局状态渲染后触发。通过 `await` 确保“更新数据 -> 更新 DOM -> 生成 SVG 快照”的绝对时序。
- **DOM 稳定性**：使用**事件委托 (Event Delegation)** 代替逐格绑定监听器。这不仅提高了渲染性能，更保证了在棋盘频繁重绘时交互功能的绝对稳定。

## 🧪 测试
``项目中包含丰富的测试用例，可确保规则的准确性：
- `tests/test_moves.py`: 基础移动测试。
- `tests/test_special_moves.py`: 易位、吃过路兵等复杂逻辑测试。
- `tests/test_visual.py`: 可视化逻辑验证。

---

# 作者声明
项目本来还有双人对战模式的，房主、棋手、观众权限都设计好了。考虑到没有真正的用户系统以及文件存储的麻烦，直接砍掉了。
~~反正这个项目做来玩的~~觉得项目有意思的，麻烦给个star~