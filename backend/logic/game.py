import os
import json
from .board import Board
from .constants import Color, MoveType
from .notation import NotationHandler

class Game:
    def __init__(self):
        self.board = Board()
        self.turn = Color.WHITE
        self.move_history = []  # 记录 SAN 记谱
        self.fen_history = []  # 延迟到加载后初始化
        self.game_over = False
        self.winner = None
        
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
            
        self.move_history = []
        self.fen_history = [NotationHandler.generate_board_fen(self.board, self.turn)]
        self.game_over = False
        self.winner = None

    def load_pgn(self, content):
        """利用 NotationHandler 简化 PGN 加载逻辑"""
        start_fen, moves = NotationHandler.parse_pgn(content)
        self.load_fen(start_fen)
        for move_str in moves:
            start, target, promo = NotationHandler.parse_san_to_move(move_str, self.turn, self.board)
            if start and target:
                self.make_move(start, target, promo)

    def get_piece_legal_moves(self, pos):
        """延迟计算：仅在前端请求特定棋子时计算其合法移动。
        不限制回合展示，允许查看对方棋子移动范围。
        """
        if self.game_over: return []
        r, c = pos
        piece = self.board.grid[r][c]
        if not piece:
            return []
        
        # 传入该棋子自身的颜色进行合法性判定
        return self.board.get_piece_legal_moves(pos, piece.color)

    def make_move(self, start, end, promotion_choice=None):
        if self.game_over:
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
                self.game_over = True
                self.winner = self.turn
        elif self.board.is_stalemate(opponent_color):
            self.game_over = True
            self.winner = None

        # 5. 生成记谱并记录历史
        move.san = NotationHandler.generate_san(self.board, move)
        self.move_history.append(move.san)

        # 6. 切换回合与历史记录
        self.turn = opponent_color
        current_fen = NotationHandler.generate_board_fen(self.board, self.turn)
        self.fen_history.append(current_fen)
        
        if not self.game_over and self.fen_history.count(current_fen) >= 3:
            self.game_over = True
            self.winner = None
            
        return True, "成功"

    def get_state_dict(self):
        """
        精简后的状态字典：移除了全量 legal_moves。
        """
        return {
            "turn": self.turn.value,
            "game_over": self.game_over,
            "winner": self.winner.value if self.winner else None,
            "history": self.move_history,
            "fen_history": self.fen_history
        }
