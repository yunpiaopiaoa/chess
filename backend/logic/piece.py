from __future__ import annotations
from typing import Any, Generator, TYPE_CHECKING

from .constants import Color, PieceType
from .rules import MoveRules

if TYPE_CHECKING:
    # 这里如果以后需要引用 Board 可以加
    pass

class Piece:
    def __init__(self, color:Color, position:tuple[int,int]):
        self.color = color
        self.position = position # (row, col)
        self.type:PieceType
        self.step = 0

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

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        """
        不再依赖 Board 对象，直接接收核心数据。
        """
        raise NotImplementedError

class Pawn(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.PAWN

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_pawn_moves(grid, rows, cols, last_move, self.position, self.color)

class Rook(Piece):
    def __init__(self, color: Color, position: tuple[int, int]):
        super().__init__(color, position)
        self.type = PieceType.ROOK

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_rook_moves(grid, rows, cols, self.position, self.color)

class Knight(Piece):
    def __init__(self, color: Color, position: tuple[int, int]):
        super().__init__(color, position)
        self.type = PieceType.KNIGHT

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_knight_moves(grid, rows, cols, self.position, self.color)

class Bishop(Piece):
    def __init__(self, color: Color, position: tuple[int, int]):
        super().__init__(color, position)
        self.type = PieceType.BISHOP

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_bishop_moves(grid, rows, cols, self.position, self.color)

class Queen(Piece):
    def __init__(self, color: Color, position: tuple[int, int]):
        super().__init__(color, position)
        self.type = PieceType.QUEEN

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_queen_moves(grid, rows, cols, self.position, self.color)

class King(Piece):
    def __init__(self, color: Color, position: tuple[int, int]):
        super().__init__(color, position)
        self.type = PieceType.KING

    def get_valid_moves(self, grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_king_moves(grid, rows, cols, self.position, self.color)
