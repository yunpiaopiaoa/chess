from .constants import Color, PieceType
from .piece import Pawn, Piece, Rook, Knight, Bishop, Queen, King
from .rules import MoveRules

class Board:
    def __init__(self, rows=8, cols=8):
        self.rows = rows
        self.cols = cols
        self.grid: list[list[Piece|None]] = [[None for _ in range(cols)] for _ in range(rows)]
        # 优化追踪器：直接存储在场棋子对象
        self.pieces = {Color.WHITE: set(), Color.BLACK: set()}
        # 缓存王的位置 (r, c)
        self.king_pos = {Color.WHITE: None, Color.BLACK: None}
        self.last_move = None # 记录 (start, end, piece)

    def _add_piece(self, piece_class, color, pos):
        r, c = pos
        piece = piece_class(color, pos)
        self.grid[r][c] = piece
        self.pieces[color].add(piece)
        if piece.type == PieceType.KING:
            self.king_pos[color] = pos

    def __str__(self):
        """
        可视化棋盘为字符串方阵
        大写为白方，小写为黑方
        """
        res = "  " + " ".join([chr(ord('a') + i) for i in range(self.cols)]) + "\n"
        res += "  " + "-" * (self.cols * 2) + "\n"
        for r in range(self.rows):
            res += f"{self.rows-r}|"
            for c in range(self.cols):
                piece = self.grid[r][c]
                if piece:
                    res += str(piece) + " "
                else:
                    res += ". "
            res += f"|{self.rows-r}\n"
        return res

    def move_piece(self, start, end):
        """
        执行移动（自动处理王车易位和吃过路兵）
        返回: (被捕获的棋子, 移动类型)
        """
        start_r, start_c = start
        end_r, end_c = end
        piece = self.grid[start_r][start_c]
        captured_piece = self.grid[end_r][end_c]
        move_type = "normal"

        # 1. 检查吃过路兵 (En Passant)
        if piece and piece.type == PieceType.PAWN and start_c != end_c and captured_piece is None:
            captured_piece = self.grid[start_r][end_c]
            self.grid[start_r][end_c] = None
            if captured_piece:
                self.pieces[captured_piece.color].remove(captured_piece)
            move_type = "en_passant"

        # 2. 更新追踪器：王的位置
        if piece and piece.type == PieceType.KING:
            self.king_pos[piece.color] = (end_r, end_c)

        # 3. 更新追踪器：移除普通被捕获棋子
        if captured_piece and move_type == "normal":
            self.pieces[captured_piece.color].remove(captured_piece)

        # 4. 执行基础位置移动
        self.grid[end_r][end_c] = piece
        self.grid[start_r][start_c] = None
        
        if piece:
            piece.position = (end_r, end_c)
            piece.step += 1

        # 5. 检查王车易位 (Castling)
        if piece and piece.type == PieceType.KING and abs(start_c - end_c) == 2:
            move_type = "castling"
            # 根据移动方向确定是长易位还是短易位
            is_kingside = (end_c > start_c)
            rook_start_c = self.cols - 1 if is_kingside else 0
            rook_end_c = end_c - 1 if is_kingside else end_c + 1
            
            rook = self.grid[start_r][rook_start_c]
            self.grid[start_r][rook_end_c] = rook
            self.grid[start_r][rook_start_c] = None
            if rook:
                rook.position = (start_r, rook_end_c)
                rook.step += 1

        self.last_move = (start, end, piece)
        return captured_piece, move_type

    def undo_move(self, start, end, captured_piece, move_type="normal"):
        """
        撤销移动（精准回滚所有特殊状态）
        """
        start_r, start_c = start
        end_r, end_c = end
        piece = self.grid[end_r][end_c]
        
        # 1. 还原基础位置
        self.grid[start_r][start_c] = piece
        self.grid[end_r][end_c] = None

        if piece:
            piece.position = (start_r, start_c)
            piece.step -= 1
            if piece.type == PieceType.KING:
                self.king_pos[piece.color] = (start_r, start_c)

        # 2. 还原被捕获棋子到追踪器
        if captured_piece:
            self.pieces[captured_piece.color].add(captured_piece)

        # 3. 还原特殊效果
        if move_type == "en_passant":
            self.grid[start_r][end_c] = captured_piece
        elif move_type == "castling":
            is_kingside = (end_c > start_c)
            rook_start_c = self.cols - 1 if is_kingside else 0
            rook_end_c = end_c - 1 if is_kingside else end_c + 1
            
            rook = self.grid[start_r][rook_end_c]
            self.grid[start_r][rook_start_c] = rook
            self.grid[start_r][rook_end_c] = None
            if rook:
                rook.position = (start_r, rook_start_c)
                rook.step -= 1
        else: # normal
            self.grid[end_r][end_c] = captured_piece

    def promote_pawn(self, pos, piece_class):
        """新方法：处理兵的升变并更新追踪器"""
        r, c = pos
        old_pawn = self.grid[r][c]
        if old_pawn:
            self.pieces[old_pawn.color].remove(old_pawn)
        
        new_piece = piece_class(old_pawn.color, pos)
        # 升变后的棋子继承 step 状态（虽然对后等不重要，但保持一致）
        new_piece.step = old_pawn.step
        self.grid[r][c] = new_piece
        self.pieces[new_piece.color].add(new_piece)
        return new_piece

    def is_in_check(self, color):
        king_pos = self.king_pos[color]
        if not king_pos: return True # 不应该发生
        return self.is_square_attacked(king_pos, color.opposite())

    def is_square_attacked(self, pos, by_color):
        """
        检查位置 pos 是否受到 by_color 方的攻击
        优化：使用 rules.py 中的反向搜索逻辑
        """
        return MoveRules.is_square_attacked(self, pos, by_color)

    def _legal_move_generator(self, color):
        """
        内部生成器：产生所有合法的移动 (start_pos, end_pos)。
        封装了“模拟-检查-撤销”的通用逻辑。
        """
        for piece in self.pieces[color]:
            start_pos = piece.position
            pseudo_moves = piece.get_valid_moves(self)
            
            for move in pseudo_moves:
                orig_last_move = self.last_move
                captured, m_type = self.move_piece(start_pos, move)
                in_check = self.is_in_check(color)
                self.undo_move(start_pos, move, captured, m_type)
                self.last_move = orig_last_move
                
                if not in_check:
                    yield start_pos, move

    def has_legal_moves(self, color):
        """判断是否存在至少一个合法移动（用于将死或僵局的快速判定）"""
        return any(self._legal_move_generator(color))

    def get_legal_moves(self, color):
        """获取所有合法移动，按起始坐标分组"""
        legal_moves = {}
        for start_pos, end_pos in self._legal_move_generator(color):
            legal_moves.setdefault(start_pos, []).append(end_pos)
        return legal_moves

    def is_checkmate(self, color):
        """优化：只有在将军的前提下才检查合法移动"""
        if not self.is_in_check(color):
            return False
        return not self.has_legal_moves(color)

    def is_stalemate(self, color):
        """优化：只有在不在将军的前提下才检查合法移动"""
        if self.is_in_check(color):
            return False
        return not self.has_legal_moves(color)
