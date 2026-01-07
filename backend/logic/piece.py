from __future__ import annotations
from typing import Any, Generator, TYPE_CHECKING

from .constants import Color, PieceType
from .rules import MoveRules

if TYPE_CHECKING:
    from .move import Move

class Piece:
    def __init__(self, color: Color, position: tuple[int, int], piece_type: PieceType):
        self.color = color
        self.position = position  # (row, col)
        self.type = piece_type
        self.step = 0

    @staticmethod
    def from_char(char: str, position: tuple[int, int]) -> Piece:
        """工厂方法：从字符（如 'P', 'n'）创建棋子对象"""
        color = Color.WHITE if char.isupper() else Color.BLACK
        # PieceType 的值本身就是大写字母 'P', 'R' 等
        return Piece(color, position, PieceType(char.upper()))

    def __str__(self):
        symbol = self.type.value
        return symbol.upper() if self.color == Color.WHITE else symbol.lower()

    def to_dict(self):
        return {
            "type": self.type.value,
            "color": self.color.value,
            "position": self.position,
            "step": self.step
        }

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[Move, None, None]:
        """
        动态派发策略：根据当前的 type 调用对应的 MoveRules
        """
        rule_map = {
            PieceType.PAWN: lambda: MoveRules.get_pawn_moves(grid, rows, cols, last_move, self.position, self.color),
            PieceType.ROOK: lambda: MoveRules.get_rook_moves(grid, rows, cols, self.position, self.color),
            PieceType.KNIGHT: lambda: MoveRules.get_knight_moves(grid, rows, cols, self.position, self.color),
            PieceType.BISHOP: lambda: MoveRules.get_bishop_moves(grid, rows, cols, self.position, self.color),
            PieceType.QUEEN: lambda: MoveRules.get_queen_moves(grid, rows, cols, self.position, self.color),
            PieceType.KING: lambda: MoveRules.get_king_moves(grid, rows, cols, self.position, self.color),
        }
        method = rule_map.get(self.type)
        if not method:
            raise NotImplementedError
        
        yield from method()
