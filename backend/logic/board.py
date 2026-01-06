from .constants import Color, PieceType
from .piece import Pawn, Piece, Rook, Knight, Bishop, Queen, King

class Board:
    def __init__(self):
        self.grid: list[list[Piece|None]] = [[None for _ in range(8)] for _ in range(8)]
        self.last_move = None # 记录 (start, end, piece)
        self.reset_board()

    def reset_board(self):
        # 初始化空棋盘
        self.grid = [[None for _ in range(8)] for _ in range(8)]
        
        # 放置白方棋子 (Row 6 and 7)
        for i in range(8):
            self.grid[6][i] = Pawn(Color.WHITE, (6, i))
        
        self.grid[7][0] = Rook(Color.WHITE, (7, 0))
        self.grid[7][7] = Rook(Color.WHITE, (7, 7))
        self.grid[7][1] = Knight(Color.WHITE, (7, 1))
        self.grid[7][6] = Knight(Color.WHITE, (7, 6))
        self.grid[7][2] = Bishop(Color.WHITE, (7, 2))
        self.grid[7][5] = Bishop(Color.WHITE, (7, 5))
        self.grid[7][3] = Queen(Color.WHITE, (7, 3))
        self.grid[7][4] = King(Color.WHITE, (7, 4))

        # 放置黑方棋子 (Row 0 and 1)
        for i in range(8):
            self.grid[1][i] = Pawn(Color.BLACK, (1, i))
            
        self.grid[0][0] = Rook(Color.BLACK, (0, 0))
        self.grid[0][7] = Rook(Color.BLACK, (0, 7))
        self.grid[0][1] = Knight(Color.BLACK, (0, 1))
        self.grid[0][6] = Knight(Color.BLACK, (0, 6))
        self.grid[0][2] = Bishop(Color.BLACK, (0, 2))
        self.grid[0][5] = Bishop(Color.BLACK, (0, 5))
        self.grid[0][3] = Queen(Color.BLACK, (0, 3))
        self.grid[0][4] = King(Color.BLACK, (0, 4))

    def get_piece(self, position):
        row, col = position
        if 0 <= row < 8 and 0 <= col < 8:
            return self.grid[row][col]
        return None

    def __str__(self):
        """
        可视化棋盘为字符串方阵
        大写为白方，小写为黑方
        """
        res = "  a b c d e f g h\n"
        res += "  ----------------\n"
        for r in range(8):
            res += f"{8-r}|"
            for c in range(8):
                piece = self.grid[r][c]
                if piece:
                    res += str(piece) + " "
                else:
                    res += ". "
            res += f"|{8-r}\n"
        res += "  ----------------\n"
        res += "  a b c d e f g h"
        return res

    def move_piece(self, start, end):
        """
        执行移动（不检查合法性，仅执行）
        """
        start_r, start_c = start
        end_r, end_c = end
        piece = self.grid[start_r][start_c]
        
        captured_piece = self.grid[end_r][end_c]
        self.grid[end_r][end_c] = piece
        self.grid[start_r][start_c] = None
        
        if piece:
            piece.position = (end_r, end_c)
            piece.has_moved = True
            
        self.last_move = (start, end, piece)
        return captured_piece

    def undo_move(self, start, end, captured_piece):
        """
        撤销移动
        """
        start_r, start_c = start
        end_r, end_c = end
        piece = self.grid[end_r][end_c]
        
        self.grid[start_r][start_c] = piece
        self.grid[end_r][end_c] = captured_piece
        
        if piece:
            piece.position = (start_r, start_c)
            # 注意：has_moved 的状态还原需要更复杂的逻辑（通常用栈记录历史）
            # 这里简单起见，如果回到初始行，我们暂时认为没动过，但这不准确
            # TODO: 实现 Move History 栈

    def find_king(self, color):
        for r in range(8):
            for c in range(8):
                piece = self.grid[r][c]
                if piece and piece.type == PieceType.KING and piece.color == color:
                    return (r, c)
        return None

    def is_in_check(self, color):
        king_pos = self.find_king(color)
        if not king_pos: return True # 不应该发生
        return self.is_square_attacked(king_pos, color.opposite())

    def is_square_attacked(self, pos, by_color):
        """
        检查位置 pos 是否受到 by_color 方的攻击
        """
        for r in range(8):
            for c in range(8):
                piece = self.grid[r][c]
                if piece and piece.color == by_color:
                    if piece.type == PieceType.PAWN:
                        pr, pc = piece.position
                        direction = -1 if piece.color == Color.WHITE else 1
                        if pos == (pr + direction, pc - 1) or pos == (pr + direction, pc + 1):
                            return True
                    elif piece.type == PieceType.KING:
                        # 王的攻击范围是周围一格，不包括易位
                        pr, pc = piece.position
                        if max(abs(pr - pos[0]), abs(pc - pos[1])) == 1:
                            return True
                    else:
                        # 其他棋子（车、马、象、后）的攻击范围等同于其伪合法移动
                        moves = piece.get_valid_moves(self)
                        if pos in moves:
                            return True
        return False

    def get_legal_moves(self, color):
        legal_moves = {} # { (start_pos): [end_positions] }
        for r in range(8):
            for c in range(8):
                piece = self.grid[r][c]
                if piece and piece.color == color:
                    pseudo_moves = piece.get_valid_moves(self)
                    valid_for_this_piece = []
                    for move in pseudo_moves:
                        # 模拟移动
                        orig_has_moved = piece.has_moved
                        orig_last_move = self.last_move
                        captured = self.move_piece((r, c), move)
                        
                        if not self.is_in_check(color):
                            valid_for_this_piece.append(move)
                        
                        # 撤销
                        self.undo_move((r, c), move, captured)
                        piece.has_moved = orig_has_moved
                        self.last_move = orig_last_move
                    
                    if valid_for_this_piece:
                        legal_moves[(r, c)] = valid_for_this_piece
        return legal_moves

    def is_checkmate(self, color):
        if not self.is_in_check(color):
            return False
        
        moves = self.get_legal_moves(color)
        return len(moves) == 0

    def is_stalemate(self, color):
        if self.is_in_check(color):
            return False
        
        moves = self.get_legal_moves(color)
        return len(moves) == 0

    def to_dict(self):
        grid_data = []
        for r in range(8):
            row_data = []
            for c in range(8):
                piece = self.grid[r][c]
                row_data.append(piece.to_dict() if piece else None)
            grid_data.append(row_data)
        return grid_data
