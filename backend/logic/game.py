from .board import Board
from .constants import Color, PieceType
from .piece import Queen, Rook, Bishop, Knight

class Game:
    def __init__(self):
        self.board = Board()
        self.turn = Color.WHITE
        self.move_history = [] # 列表存储 SAN 记谱
        self.snapshots = [self.board.to_dict()] # 存储每一着后的棋盘状态快照 (含初始状态)
        self.game_over = False
        self.winner = None

    def _coord_to_algebraic(self, pos):
        row, col = pos
        return f"{chr(ord('a') + col)}{8 - row}"

    def make_move(self, start, end, promotion_choice=None):
        """
        尝试执行移动。返回 (Success, Message)
        """
        if self.game_over:
            return False, "游戏已结束"

        legal_moves = self.board.get_legal_moves(self.turn)
        if start not in legal_moves or end not in legal_moves[start]:
            return False, "非法移动"

        piece = self.board.get_piece(start)
        is_capture = self.board.grid[end[0]][end[1]] is not None
        
        # 记录移动信息（简易版 SAN 逻辑）
        move_notation = ""
        if piece.type != PieceType.PAWN:
            move_notation += piece.type.value
        if is_capture:
            if piece.type == PieceType.PAWN:
                move_notation += chr(ord('a') + start[1])
            move_notation += "x"
        move_notation += self._coord_to_algebraic(end)

        # 处理王车易位 (执行车的移动)
        if piece.type == PieceType.KING and abs(start[1] - end[1]) == 2:
            row = start[0]
            if end[1] == 6: # 王翼
                self.board.move_piece((row, 7), (row, 5))
                move_notation = "O-O"
            elif end[1] == 2: # 后翼
                self.board.move_piece((row, 0), (row, 3))
                move_notation = "O-O-O"
        
        # 处理吃过路兵 (扣除被吃掉的小兵)
        if piece.type == PieceType.PAWN and start[1] != end[1] and self.board.grid[end[0]][end[1]] is None:
            # 这是一个过路兵捕获
            self.board.grid[start[0]][end[1]] = None
            is_capture = True
            move_notation = f"{chr(ord('a') + start[1])}x{self._coord_to_algebraic(end)} e.p."

        # 执行基础移动
        self.board.move_piece(start, end)
        
        # 处理兵的升变
        if piece.type == PieceType.PAWN:
            last_row = 0 if piece.color == Color.WHITE else 7
            if end[0] == last_row:
                # 默认升变为后，除非指定了 promotion_choice
                promoted_piece = Queen(piece.color, end)
                p_char = "Q"
                if promotion_choice == "R": 
                    promoted_piece = Rook(piece.color, end)
                    p_char = "R"
                elif promotion_choice == "B": 
                    promoted_piece = Bishop(piece.color, end)
                    p_char = "B"
                elif promotion_choice == "N": 
                    promoted_piece = Knight(piece.color, end)
                    p_char = "N"
                self.board.grid[end[0]][end[1]] = promoted_piece
                move_notation += f"={p_char}"

        # 检查将军
        if self.board.is_in_check(self.turn.opposite()):
            move_notation += "+"

        self.move_history.append(move_notation)
        self.snapshots.append(self.board.to_dict())

        # 切换回合
        self.turn = self.turn.opposite()
        
        # 结果检查
        if self.board.is_checkmate(self.turn):
            self.game_over = True
            self.winner = self.turn.opposite()
            self.move_history[-1] = self.move_history[-1].replace("+", "#")
        elif self.board.is_stalemate(self.turn):
            self.game_over = True
            self.winner = None # 平局
            
        return True, "成功"

    def get_pgn(self):
        pgn = ""
        for i in range(0, len(self.move_history), 2):
            move_num = i // 2 + 1
            pgn += f"{move_num}. {self.move_history[i]} "
            if i + 1 < len(self.move_history):
                pgn += f"{self.move_history[i+1]} "
        
        result = "1-0" if self.winner == Color.WHITE else ("0-1" if self.winner == Color.BLACK else "1/2-1/2")
        if not self.game_over: result = "*"
        return pgn + result

    def get_state_dict(self):
        return {
            "board": self.board.to_dict(),
            "turn": self.turn.value,
            "game_over": self.game_over,
            "winner": self.winner.value if self.winner else None,
            "legal_moves": {f"{r},{c}": moves for (r, c), moves in self.board.get_legal_moves(self.turn).items()},
            "history": self.move_history,
            "snapshots": self.snapshots,
            "pgn": self.get_pgn()
        }
