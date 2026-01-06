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
