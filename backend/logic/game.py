import os
import json
from .board import Board
from .constants import Color, PieceType
from .piece import Piece, Queen, Rook, Bishop, Knight
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
        """延迟计算：仅在前端请求特定棋子时计算其合法移动"""
        if self.game_over: return []
        return self.board.get_piece_legal_moves(pos, self.turn)

    def make_move(self, start, end, promotion_choice=None):
        if self.game_over:
            return False, "游戏已结束"

        # 获取该位置棋子的合法移动（仅针对当前点击或尝试拖拽的棋子计算）
        legal_moves = self.get_piece_legal_moves(start)
        if not legal_moves or end not in legal_moves:
            return False, "非法移动"

        piece: Piece = self.board.grid[start[0]][start[1]] # 既然通过了合法校验，piece 肯定存在
        
        # 移动前的变量准备
        is_capture = self.board.grid[end[0]][end[1]] is not None or \
                     (piece.type == PieceType.PAWN and start[1] != end[1])
        
        # 记录移动信息
        move_notation = ""
        if piece.type == PieceType.KING and abs(start[1] - end[1]) == 2:
            move_notation = "O-O" if end[1] == 6 else "O-O-O"
        else:
            if piece.type != PieceType.PAWN:
                move_notation += piece.type.value
            elif is_capture:
                move_notation += chr(ord('a') + start[1])
            
            if is_capture: move_notation += "x"
            move_notation += NotationHandler.coord_to_algebraic(end, self.board.rows)

        # 执行移动
        self.board.move_piece(start, end)
        
        # 处理升变
        if piece.type == PieceType.PAWN:
            last_row = 0 if piece.color == Color.WHITE else self.board.rows - 1
            if end[0] == last_row:
                choices = {"Q": Queen, "R": Rook, "B": Bishop, "N": Knight}
                target_class = choices.get(promotion_choice, Queen)
                p_char = promotion_choice if promotion_choice in choices else "Q"
                self.board.promote_pawn(end, target_class)
                move_notation += f"={p_char}"

        if self.board.is_in_check(self.turn.opposite()):
            move_notation += "+"

        self.move_history.append(move_notation)
        self.turn = self.turn.opposite()
        
        # 三次重复检测
        current_fen = NotationHandler.generate_board_fen(self.board, self.turn)
        self.fen_history.append(current_fen)

        if self.board.is_checkmate(self.turn):
            self.game_over = True
            self.winner = self.turn.opposite()
            if self.move_history:
                self.move_history[-1] = self.move_history[-1].replace("+", "#")
        elif self.board.is_stalemate(self.turn):
            self.game_over = True
            self.winner = None
        elif self.fen_history.count(current_fen) >= 3:
            self.game_over = True
            self.winner = None # 平局
            
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
