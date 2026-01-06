from .constants import Color, PieceType

class MoveRules:
    # 基础移动向量
    STRAIGHT_DIRS = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    DIAGONAL_DIRS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    KNIGHT_OFFSETS = [(2,1), (2,-1), (-2,1), (-2,-1), (1,2), (1,-2), (-1,2), (-1,-2)]

    @staticmethod
    def is_square_attacked(board, pos, by_color):
        """
        使用配置化的反向探测逻辑，极大简化代码量。
        """
        r, c = pos
        pawn_offset = 1 if by_color == Color.WHITE else -1
        max_range = max(board.rows, board.cols)
        
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
                    if not (0 <= nr < board.rows and 0 <= nc < board.cols): break
                    p = board.grid[nr][nc]
                    if p:
                        if p.color == by_color and p.type in p_types:
                            return True
                        break # 被任何棋子阻挡
        return False

    @staticmethod
    def _get_moves_in_directions(board, pos, color, directions, limit=None):
        """
        统一的方向性移动探测逻辑，支持滑行（limit=None -> max_range）和跳步/单步（limit=1）。
        """
        if limit is None:
            limit = max(board.rows, board.cols)
            
        moves = []
        r, c = pos
        for dr, dc in directions:
            for i in range(1, limit + 1):
                nr, nc = r + dr * i, c + dc * i
                if not (0 <= nr < board.rows and 0 <= nc < board.cols): break
                target = board.grid[nr][nc]
                if target is None:
                    moves.append((nr, nc))
                elif target.color != color:
                    moves.append((nr, nc))
                    break
                else: break
        return moves

    @staticmethod
    def get_rook_moves(board, pos, color):
        return MoveRules._get_moves_in_directions(board, pos, color, MoveRules.STRAIGHT_DIRS)

    @staticmethod
    def get_bishop_moves(board, pos, color):
        return MoveRules._get_moves_in_directions(board, pos, color, MoveRules.DIAGONAL_DIRS)

    @staticmethod
    def get_queen_moves(board, pos, color):
        return MoveRules.get_rook_moves(board, pos, color) + \
               MoveRules.get_bishop_moves(board, pos, color)

    @staticmethod
    def get_knight_moves(board, pos, color):
        return MoveRules._get_moves_in_directions(board, pos, color, MoveRules.KNIGHT_OFFSETS, limit=1)

    @staticmethod
    def get_pawn_moves(board, pos, color):
        moves = []
        r, c = pos
        piece = board.grid[r][c]
        direction = -1 if color == Color.WHITE else 1
        
        # 1. 前进
        tr, tc = r + direction, c
        if 0 <= tr < board.rows and 0 <= tc < board.cols and board.grid[tr][tc] is None:
            moves.append((tr, tc))
            # 初始两格：根据 piece.step
            if piece and piece.step == 0:
                tr2, tc2 = tr + direction, tc
                if 0 <= tr2 < board.rows and 0 <= tc2 < board.cols and board.grid[tr2][tc2] is None:
                    moves.append((tr2, tc2))
        
        # 2. 吃子与过路兵
        for dc in [-1, 1]:
            tr, tc = r + direction, c + dc
            if not (0 <= tr < board.rows and 0 <= tc < board.cols): continue
            
            target = board.grid[tr][tc]
            if target and target.color != color:
                moves.append((tr, tc))
            elif target is None and board.last_move:
                # 过路兵检查
                l_start, l_end, l_piece = board.last_move
                if l_piece and l_piece.type == PieceType.PAWN and l_piece.color != color:
                    if l_end == (r, c + dc) and abs(l_start[0] - l_end[0]) == 2:
                        moves.append((tr, tc))
        return moves

    @staticmethod
    def get_king_moves(board, pos, color):
        # 1. 基础移动（一步范围）
        moves = MoveRules._get_moves_in_directions(
            board, pos, color, 
            MoveRules.STRAIGHT_DIRS + MoveRules.DIAGONAL_DIRS, 
            limit=1
        )
        
        # 2. 王车易位
        r, c = pos
        king = board.grid[r][c]
        if not king or king.step > 0:
            return moves

        # 只有在不被将军时才能发起易位
        if not MoveRules.is_square_attacked(board, pos, color.opposite()):
            # 动态检查两端的车 (0 和 board.cols - 1)
            for rook_col in [0, board.cols - 1]:
                rook = board.grid[r][rook_col]
                if rook and rook.type == PieceType.ROOK and rook.step == 0:
                    # 动态计算王与车之间的列 (bridge_cols)
                    step = 1 if rook_col > c else -1
                    bridge_cols = range(c + step, rook_col, step)
                    
                    if all(board.grid[r][col] is None for col in bridge_cols):
                        # 国际象棋规则：王经过的格子和到达的格子不能受攻击 (check_cols)
                        target_col = c + 2 * step
                        check_path = [c + step, target_col]
                        
                        if all(not MoveRules.is_square_attacked(board, (r, col), color.opposite()) for col in check_path):
                            moves.append((r, target_col))
        return moves
