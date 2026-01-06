from .constants import Color, PieceType

class Piece:
    def __init__(self, color, position):
        self.color = color
        self.position = position # (row, col)
        self.type = None
        self.has_moved = False

    def __str__(self):
        symbol = self.type.value
        return symbol.upper() if self.color == Color.WHITE else symbol.lower()

    def to_dict(self):
        return {
            "type": self.type.value,
            "color": self.color.value,
            "position": self.position,
            "has_moved": self.has_moved
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
        moves = []
        r, c = self.position
        direction = -1 if self.color == Color.WHITE else 1
        
        # 前进一步
        if 0 <= r + direction < 8:
            if board.grid[r + direction][c] is None:
                moves.append((r + direction, c))
                # 初始位置可以走两步
                start_row = 6 if self.color == Color.WHITE else 1
                if r == start_row and board.grid[r + 2 * direction][c] is None:
                    moves.append((r + 2 * direction, c))
        
        # 斜向吃子
        for dc in [-1, 1]:
            if 0 <= r + direction < 8 and 0 <= c + dc < 8:
                target = board.grid[r + direction][c + dc]
                if target and target.color != self.color:
                    moves.append((r + direction, c + dc))
                
                # 吃过路兵 (En Passant)
                elif target is None:
                    # 检查最后一步是否是对方的小兵跃进两格
                    if board.last_move:
                        l_start, l_end, l_piece = board.last_move
                        if l_piece and l_piece.type == PieceType.PAWN and l_piece.color != self.color:
                            if l_end == (r, c + dc) and abs(l_start[0] - l_end[0]) == 2:
                                moves.append((r + direction, c + dc))
        
        return moves

class Rook(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.ROOK

    def get_valid_moves(self, board):
        moves = []
        r, c = self.position
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        for dr, dc in directions:
            for i in range(1, 8):
                nr, nc = r + dr * i, c + dc * i
                if 0 <= nr < 8 and 0 <= nc < 8:
                    target = board.grid[nr][nc]
                    if target is None:
                        moves.append((nr, nc))
                    elif target.color != self.color:
                        moves.append((nr, nc))
                        break
                    else:
                        break
                else:
                    break
        return moves

class Knight(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.KNIGHT

    def get_valid_moves(self, board):
        moves = []
        r, c = self.position
        offsets = [(2,1), (2,-1), (-2,1), (-2,-1), (1,2), (1,-2), (-1,2), (-1,-2)]
        for dr, dc in offsets:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                target = board.grid[nr][nc]
                if target is None or target.color != self.color:
                    moves.append((nr, nc))
        return moves

class Bishop(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.BISHOP

    def get_valid_moves(self, board):
        moves = []
        r, c = self.position
        directions = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        for dr, dc in directions:
            for i in range(1, 8):
                nr, nc = r + dr * i, c + dc * i
                if 0 <= nr < 8 and 0 <= nc < 8:
                    target = board.grid[nr][nc]
                    if target is None:
                        moves.append((nr, nc))
                    elif target.color != self.color:
                        moves.append((nr, nc))
                        break
                    else:
                        break
                else:
                    break
        return moves

class Queen(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.QUEEN

    def get_valid_moves(self, board):
        # 皇后 = 车 + 象
        rook_moves = Rook.get_valid_moves(self, board)
        bishop_moves = Bishop.get_valid_moves(self, board)
        return rook_moves + bishop_moves

class King(Piece):
    def __init__(self, color, position):
        super().__init__(color, position)
        self.type = PieceType.KING

    def get_valid_moves(self, board):
        moves = []
        r, c = self.position
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                target = board.grid[nr][nc]
                if target is None or target.color != self.color:
                    moves.append((nr, nc))
        
        # 王车易位 (Castling)
        if not self.has_moved and not board.is_in_check(self.color):
            # 王翼易位 (King-side)
            row = 7 if self.color == Color.WHITE else 0
            # 检查车
            rook_ks = board.grid[row][7]
            if rook_ks and rook_ks.type == PieceType.ROOK and not rook_ks.has_moved:
                if board.grid[row][5] is None and board.grid[row][6] is None:
                    if not board.is_square_attacked((row, 5), self.color.opposite()) and \
                       not board.is_square_attacked((row, 6), self.color.opposite()):
                        moves.append((row, 6))
            
            # 后翼易位 (Queen-side)
            rook_qs = board.grid[row][0]
            if rook_qs and rook_qs.type == PieceType.ROOK and not rook_qs.has_moved:
                if board.grid[row][1] is None and board.grid[row][2] is None and board.grid[row][3] is None:
                    if not board.is_square_attacked((row, 3), self.color.opposite()) and \
                       not board.is_square_attacked((row, 2), self.color.opposite()):
                        moves.append((row, 2))
                        
        return moves
