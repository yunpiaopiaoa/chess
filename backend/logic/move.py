from __future__ import annotations
from typing import TYPE_CHECKING, Any
from .constants import MoveType, PieceType

if TYPE_CHECKING:
    from .piece import Piece
    from .board import Board

class Move:
    """
    命令模式核心：每个移动对象都知道如何执行和撤销自己。
    """
    def __init__(
        self, 
        start: tuple[int, int], 
        end: tuple[int, int], 
        piece: Piece,
        captured_piece: Piece | None = None,
        move_type: MoveType = MoveType.NORMAL,
        promotion_choice: str | None = None
    ):
        self.start = start
        self.end = end
        self.piece = piece
        self.captured_piece = captured_piece
        self.move_type = move_type
        self.promotion_choice = promotion_choice
        
        # 结果标记
        self.is_check = False
        self.is_checkmate = False
        self.san = ""

    def __repr__(self):
        return self.san if self.san else f"Move({self.start}->{self.end})"

    def execute(self, board: Board):
        sr, sc = self.start
        er, ec = self.end
        
        # 1. 处理吃子
        if self.captured_piece:
            cr, cc = self.captured_piece.position
            board.grid[cr][cc] = None
            if self.captured_piece in board.pieces[self.captured_piece.color]:
                board.pieces[self.captured_piece.color].remove(self.captured_piece)

        # 2. 移动棋子
        board.grid[sr][sc] = None
        board.grid[er][ec] = self.piece
        self.piece.position = (er, ec)
        self.piece.step += 1

        # 3. 更新缓存
        if self.piece.type == PieceType.KING:
            board.king_pos[self.piece.color] = (er, ec)
        
        board.last_move = self

    def undo(self, board: Board):
        sr, sc = self.start
        er, ec = self.end

        # 1. 移回棋子
        board.grid[er][ec] = None
        board.grid[sr][sc] = self.piece
        self.piece.position = (sr, sc)
        self.piece.step -= 1

        # 2. 恢复被吃棋子
        if self.captured_piece:
            cr, cc = self.captured_piece.position
            board.grid[cr][cc] = self.captured_piece
            board.pieces[self.captured_piece.color].add(self.captured_piece)

        # 3. 恢复王位置缓存
        if self.piece.type == PieceType.KING:
            board.king_pos[self.piece.color] = (sr, sc)

    def __eq__(self, other):
        if not isinstance(other, Move):
            return False
        return self.start == other.start and self.end == other.end

class CastlingMove(Move):
    def __init__(self, start, end, piece, is_kingside):
        super().__init__(start, end, piece, move_type=MoveType.CASTLING)
        self.is_kingside = is_kingside

    def execute(self, board: Board):
        super().execute(board)
        # 处理车的移动
        r = self.start[0]
        rook_start_c = (board.cols - 1) if self.is_kingside else 0
        rook_end_c = (self.end[1] - 1) if self.is_kingside else (self.end[1] + 1)
        
        rook = board.grid[r][rook_start_c]
        if rook:
            board.grid[r][rook_start_c] = None
            board.grid[r][rook_end_c] = rook
            rook.position = (r, rook_end_c)
            rook.step += 1

    def undo(self, board: Board):
        super().undo(board)
        r = self.start[0]
        rook_start_c = (board.cols - 1) if self.is_kingside else 0
        rook_end_c = (self.end[1] - 1) if self.is_kingside else (self.end[1] + 1)
        
        rook = board.grid[r][rook_end_c]
        if rook:
            board.grid[r][rook_end_c] = None
            board.grid[r][rook_start_c] = rook
            rook.position = (r, rook_start_c)
            rook.step -= 1

class EnPassantMove(Move):
    def __init__(self, start, end, piece, captured_piece):
        super().__init__(start, end, piece, captured_piece=captured_piece, move_type=MoveType.EN_PASSANT)

class PromotionMove(Move):
    def __init__(self, start, end, piece, captured_piece=None, promotion_choice: str | None = None):
        super().__init__(start, end, piece, captured_piece=captured_piece, move_type=MoveType.PROMOTION, promotion_choice=promotion_choice)
        self.old_type = piece.type

    def execute(self, board: Board):
        #WARNING: 注意这里没有创建新棋子对象，而是直接修改原棋子的类型
        #升变本身不需要修改board的pieces集合，因为piece对象没有变
        super().execute(board)
        # 原地升变：直接修改 piece 的属性
        if self.promotion_choice:
            self.piece.type = PieceType(self.promotion_choice.upper())

    def undo(self, board: Board):
        # 先恢复原来的类型（兵）
        self.piece.type = self.old_type
        # 再执行基类的撤销逻辑（移回位置、恢复被吃棋子）
        super().undo(board)

    def to_dict(self):
        return {
            "start": self.start,
            "end": self.end,
            "piece": self.piece.to_dict(),
            "captured": self.captured_piece.to_dict() if self.captured_piece else None,
            "move_type": self.move_type.value,
            "san": self.san
        }
