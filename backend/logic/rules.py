from __future__ import annotations
from typing import TYPE_CHECKING, Generator, Any
from .constants import Color, PieceType

if TYPE_CHECKING:
    from .piece import Piece

class MoveRules:
    # 基础移动向量
    STRAIGHT_DIRS = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    DIAGONAL_DIRS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    KNIGHT_OFFSETS = [(2,1), (2,-1), (-2,1), (-2,-1), (1,2), (1,-2), (-1,2), (-1,-2)]

    @staticmethod
    def is_square_attacked(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], by_color: Color) -> bool:
        """
        不再依赖 Board 对象，直接接收 grid 和维度的纯函数。
        """
        r, c = pos
        pawn_offset = 1 if by_color == Color.WHITE else -1
        max_range = max(rows, cols)
        
        # (方向向量, 匹配的棋子类型, 最大射程)
        configs = [
            (MoveRules.KNIGHT_OFFSETS, [PieceType.KNIGHT], 1),
            (MoveRules.STRAIGHT_DIRS, [PieceType.ROOK, PieceType.QUEEN], max_range),
            (MoveRules.DIAGONAL_DIRS, [PieceType.BISHOP, PieceType.QUEEN], max_range),
            ([(pawn_offset, -1), (pawn_offset, 1)], [PieceType.PAWN], 1),
            (MoveRules.STRAIGHT_DIRS + MoveRules.DIAGONAL_DIRS, [PieceType.KING], 1)
        ]

        for dirs, p_types, limit in configs:
            for dr, dc in dirs:
                for i in range(1, limit + 1):
                    nr, nc = r + dr * i, c + dc * i
                    if not (0 <= nr < rows and 0 <= nc < cols): break
                    p = grid[nr][nc]
                    if p:
                        if p.color == by_color and p.type in p_types:
                            return True
                        break # 被任何棋子阻挡
        return False

    @staticmethod
    def _get_moves_in_directions(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color, directions: list[tuple[int, int]], limit: int | None = None) -> Generator[tuple[int, int], None, None]:
        if limit is None:
            limit = max(rows, cols)
            
        r, c = pos
        for dr, dc in directions:
            for i in range(1, limit + 1):
                nr, nc = r + dr * i, c + dc * i
                if not (0 <= nr < rows and 0 <= nc < cols): break
                target = grid[nr][nc]
                if target is None:
                    yield (nr, nc)
                elif target.color != color:
                    yield (nr, nc)
                    break
                else: break

    @staticmethod
    def get_rook_moves(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        return MoveRules._get_moves_in_directions(grid, rows, cols, pos, color, MoveRules.STRAIGHT_DIRS)

    @staticmethod
    def get_bishop_moves(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        return MoveRules._get_moves_in_directions(grid, rows, cols, pos, color, MoveRules.DIAGONAL_DIRS)

    @staticmethod
    def get_queen_moves(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        yield from MoveRules.get_rook_moves(grid, rows, cols, pos, color)
        yield from MoveRules.get_bishop_moves(grid, rows, cols, pos, color)

    @staticmethod
    def get_knight_moves(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        return MoveRules._get_moves_in_directions(grid, rows, cols, pos, color, MoveRules.KNIGHT_OFFSETS, limit=1)

    @staticmethod
    def get_pawn_moves(grid: list[list[Piece | None]], rows: int, cols: int, last_move: Any, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        r, c = pos
        piece = grid[r][c]
        direction = -1 if color == Color.WHITE else 1
        
        # 1. 前进
        tr, tc = r + direction, c
        if 0 <= tr < rows and 0 <= tc < cols and grid[tr][tc] is None:
            yield (tr, tc)
            if piece and piece.step == 0:
                tr2, tc2 = tr + direction, tc
                if 0 <= tr2 < rows and 0 <= tc2 < cols and grid[tr2][tc2] is None:
                    yield (tr2, tc2)
        
        # 2. 吃子与过路兵
        for dc in [-1, 1]:
            tr, tc = r + direction, c + dc
            if not (0 <= tr < rows and 0 <= tc < cols): continue
            
            target = grid[tr][tc]
            if target and target.color != color:
                yield (tr, tc)
            elif target is None and last_move:
                l_start, l_end, l_piece = last_move
                if l_piece and l_piece.type == PieceType.PAWN and l_piece.color != color:
                    if l_end == (r, c + dc) and abs(l_start[0] - l_end[0]) == 2:
                        yield (tr, tc)

    @staticmethod
    def get_king_moves(grid: list[list[Piece | None]], rows: int, cols: int, pos: tuple[int, int], color: Color) -> Generator[tuple[int, int], None, None]:
        # 1. 基础移动
        yield from MoveRules._get_moves_in_directions(
            grid, rows, cols, pos, color, 
            MoveRules.STRAIGHT_DIRS + MoveRules.DIAGONAL_DIRS, 
            limit=1
        )
        
        # 2. 王车易位 (需要检查格点是否被攻击)
        r, c = pos
        king = grid[r][c]
        if not king or king.step > 0: return

        # 只有在不被将军时才能发起易位
        if not MoveRules.is_square_attacked(grid, rows, cols, pos, color.opposite()):
            for rook_col in [0, cols - 1]:
                rook = grid[r][rook_col]
                if rook and rook.type == PieceType.ROOK and rook.step == 0:
                    step = 1 if rook_col > c else -1
                    bridge_cols = range(c + step, rook_col, step)
                    if not all(grid[r][col] is None for col in bridge_cols):
                        continue # 路被阻挡
                    target_col = c + 2 * step
                    # 检查路径格子是否受攻击（不包括王起始位置，因为已经检查过了）
                    check_path = range(c + step, target_col + step, step)
                    if all(not MoveRules.is_square_attacked(grid, rows, cols, (r, col), color.opposite()) for col in check_path):
                        yield (r, target_col)
