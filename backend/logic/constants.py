from enum import Enum

class Color(Enum):
    WHITE = "white"
    BLACK = "black"

    def opposite(self):
        return Color.BLACK if self == Color.WHITE else Color.WHITE

class PieceType(Enum):
    PAWN = "P"
    ROOK = "R"
    KNIGHT = "N"
    BISHOP = "B"
    QUEEN = "Q"
    KING = "K"

class MoveType(Enum):
    NORMAL = "normal"
    EN_PASSANT = "en_passant"
    CASTLING = "castling"
    PROMOTION = "promotion"

class GameStatus(Enum):
    ONGOING = "ongoing"
    DRAW = "draw"
    WHITE_WIN = "white_win"
    BLACK_WIN = "black_win"
