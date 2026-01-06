from .constants import Color, PieceType
from .rules import MoveRules

class Piece:
    def __init__(self, color, position):
        self.color = color
        self.position = position # (row, col)
        self.type = None
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

    def get_valid_moves(self, board):
        """
        返回该棋子在当前棋盘上的所有拟制合法移动（未考虑王车安全）。
        子类需实现此方法。
        """
        raise NotImplementedError

class Pawn(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.PAWN

    def get_valid_moves(self, board):
        return MoveRules.get_pawn_moves(board, self.position, self.color)

class Rook(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.ROOK

    def get_valid_moves(self, board):
        return MoveRules.get_rook_moves(board, self.position, self.color)

class Knight(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.KNIGHT

    def get_valid_moves(self, board):
        return MoveRules.get_knight_moves(board, self.position, self.color)

class Bishop(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.BISHOP

    def get_valid_moves(self, board):
        return MoveRules.get_bishop_moves(board, self.position, self.color)

class Queen(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.QUEEN

    def get_valid_moves(self, board):
        return MoveRules.get_queen_moves(board, self.position, self.color)

class King(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.KING

    def get_valid_moves(self, board):
        return MoveRules.get_king_moves(board, self.position, self.color)
