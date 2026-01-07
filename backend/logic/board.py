from __future__ import annotations
from typing import TYPE_CHECKING

from .constants import Color, PieceType
from .rules import MoveRules

if TYPE_CHECKING:
    from .piece import Piece
    from .move import Move

class Board:
    def __init__(self, rows=8, cols=8):
        self.rows = rows
        self.cols = cols
        self.grid: list[list[Piece|None]] = [[None for _ in range(cols)] for _ in range(rows)]
        # 优化追踪器：直接存储在场棋子对象
        self.pieces:dict[Color,set[Piece]] = {Color.WHITE: set(), Color.BLACK: set()}
        # 缓存王的位置 (r, c)
        self.king_pos: dict[Color, tuple[int, int]|None] = {Color.WHITE: None, Color.BLACK: None}
        self.last_move: Move | None = None # 记录最后的 Move 对象

    def _add_piece(self, piece: Piece):
        r, c = piece.position
        self.grid[r][c] = piece
        self.pieces[piece.color].add(piece)
        if piece.type == PieceType.KING:
            self.king_pos[piece.color] = piece.position

    def __str__(self):
        """
        可视化棋盘为字符串方阵
        大写为白方，小写为黑方
        """
        res = "  " + " ".join([chr(ord('a') + i) for i in range(self.cols)]) + "\n"
        res += "  " + "-" * (self.cols * 2) + "\n"
        for r in range(self.rows):
            res += f"{self.rows-r}|"
            for c in range(self.cols):
                piece = self.grid[r][c]
                if piece:
                    res += str(piece) + " "
                else:
                    res += ". "
            res += f"|{self.rows-r}\n"
        return res

    def is_in_check(self, color:Color):
        king_pos = self.king_pos[color]
        if not king_pos: return True # 不应该发生
        return MoveRules.is_square_attacked(self.grid, self.rows, self.cols, king_pos, color.opposite())

    def _legal_move_generator(self, color):
        """
        内部生成器：产生所有合法的 Move 对象。
        """
        for piece in self.pieces[color]:
            yield from self.get_piece_legal_moves(piece.position, color)

    def get_piece_legal_moves(self, pos:tuple[int,int], color:Color):
        """新增：仅计算特定位置棋子的合法移动（延迟计算的关键）"""
        r, c = pos
        piece = self.grid[r][c]
        if not piece or piece.color != color:
            return []

        legal_moves:list[Move] = []
        for move in piece.get_valid_moves(self.grid, self.rows, self.cols, self.last_move):
            orig_last_move = self.last_move
            move.execute(self)
            in_check = self.is_in_check(color)
            move.undo(self)
            self.last_move = orig_last_move
            
            if not in_check:
                legal_moves.append(move)
        return legal_moves

    def has_legal_moves(self, color):
        """判断是否存在至少一个合法移动（用于将死或僵局的快速判定）"""
        return any(self._legal_move_generator(color))

    def get_legal_moves(self, color):
        """获取所有合法移动，按起始坐标分组"""
        legal_moves = {}
        for move in self._legal_move_generator(color):
            legal_moves.setdefault(move.start, []).append(move)
        return legal_moves

    def is_checkmate(self, color):
        """优化：只有在将军的前提下才检查合法移动"""
        if not self.is_in_check(color):
            return False
        return not self.has_legal_moves(color)

    def is_stalemate(self, color):
        """优化：只有在不在将军的前提下才检查合法移动"""
        if self.is_in_check(color):
            return False
        return not self.has_legal_moves(color)
