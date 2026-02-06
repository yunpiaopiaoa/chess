import os
import json

from backend.logic.move import Move
from .board import Board
from .constants import Color, MoveType, GameStatus
from .notation import NotationHandler

class Game:
    def __init__(self):
        self.board = Board()
        self.turn = Color.WHITE
        self.history:list[Move] = []  # 存储 Move 对象序列，用于撤销 and SAN 显示
        self.fen_history = []  # 缓存 FEN 历史，用于历史轨迹查看
        self.status = GameStatus.ONGOING
        
        # 加载默认配置或执行默认初始化
        self._load_settings()

    def _load_settings(self):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        init_board_path = os.path.join(os.path.dirname(current_dir), "data", "init_board.json")
        
        default_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        if os.path.exists(init_board_path):
            try:
                with open(init_board_path, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                    default_fen = settings.get("default", default_fen)
            except Exception as e:
                print(f"加载配置文件失败: {e}")
        
        self.load_fen(default_fen)

    def load_fen(self, fen):
        """从 FEN 初始化游戏状态"""
        NotationHandler.parse_fen_to_board(self.board, fen)
        parts = fen.split()
        if len(parts) > 1:
            self.turn = Color.WHITE if parts[1] == 'w' else Color.BLACK
        else:
            self.turn = Color.WHITE
            
        self.history = []
        self.fen_history = [NotationHandler.generate_board_fen(self.board, self.turn)]
        self.status = GameStatus.ONGOING

    def load_pgn(self, content):
        """利用 NotationHandler 简化 PGN 加载逻辑"""
        start_fen, moves = NotationHandler.parse_pgn(content)
        self.load_fen(start_fen)
        for move_str in moves:
            start, target, promo = NotationHandler.parse_san_to_move(move_str, self.turn, self.board)
            if start and target:
                self.make_move(start, target, promo)

    @staticmethod
    def get_moves_for_fen(fen: str, pos: tuple[int, int]):
        """
        静态工具方法：在任意 FEN 局面上计算特定位置的合法移动。
        用于历史研究、复盘分析等无状态场景。
        """
        from .board import Board
        temp_board = Board()
        NotationHandler.parse_fen_to_board(temp_board, fen)
        
        r, c = pos
        piece = temp_board.grid[r][c]
        if not piece:
            return []
        
        # 传入该棋子自身的颜色进行合法性判定
        return temp_board.get_piece_legal_moves(pos, piece.color)

    def get_piece_legal_moves(self, pos):
        """当前对局中获取特定位置棋子的合法移动"""
        r, c = pos
        piece = self.board.grid[r][c]
        if not piece:
            return []
        return self.board.get_piece_legal_moves(pos, piece.color)

    def make_move(self, start, end, promotion_choice=None):
        if self.status != GameStatus.ONGOING:
            return False, "游戏已结束"

        # 1. 验证合法性并获取完整的 Move 对象
        legal_moves = self.get_piece_legal_moves(start)
        move = next((m for m in legal_moves if m.end == end), None)
        
        if not move:
            return False, "非法移动"

        # 2. 如果是升变，记录选择
        if move.move_type == MoveType.PROMOTION:
            move.promotion_choice = (promotion_choice or "Q").upper()

        # 3. 执行单次物理移动
        move.execute(self.board)

        # 4. 更新对局状态（将军、将死、平局）
        opponent_color = self.turn.opposite()
        if self.board.is_in_check(opponent_color):
            move.is_check = True
            if self.board.is_checkmate(opponent_color):
                move.is_checkmate = True
                self.status = GameStatus.WHITE_WIN if self.turn == Color.WHITE else GameStatus.BLACK_WIN
        elif self.board.is_stalemate(opponent_color):
            self.status = GameStatus.DRAW

        # 5. 生成记谱并记录历史对象
        move.san = NotationHandler.generate_san(self.board, move)
        self.history.append(move)

        # 6. 切换回合与历史记录
        self.turn = opponent_color
        current_fen = NotationHandler.generate_board_fen(self.board, self.turn)
        self.fen_history.append(current_fen)
        
        if self.status == GameStatus.ONGOING and self.fen_history.count(current_fen) >= 3:
            self.status = GameStatus.DRAW
            
        return True, "成功"

    def undo_move(self):
        """撤销最后一步"""
        if not self.history:
            return False, "没有可撤销的移动"
        
        # 1. 弹出最后的移动对象
        last_move = self.history.pop()
        
        # 2. 调用命令对象的 undo
        last_move.undo(self.board)
        
        # 3. 同步其他状态
        self.fen_history.pop()
        self.turn = self.turn.opposite()
        self.status = GameStatus.ONGOING
        
        # 4. 恢复 board.last_move 为上一个移动（如果存在）
        self.board.last_move = self.history[-1] if self.history else None
        
        return True, "撤销成功"

    def get_state_dict(self):
        """
        精简后的状态字典：移除了全量 legal_moves。
        """
        return {
            "turn": self.turn.value,
            "status": self.status.value,
            "history": [m.san for m in self.history],
            "fen_history": self.fen_history
        }
