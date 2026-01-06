import re
import json
from .constants import Color, PieceType
from .piece import Pawn, Rook, Knight, Bishop, Queen, King

class NotationHandler:
    @staticmethod
    def coord_to_algebraic(pos, rows):
        """(r, c) -> 'e4'"""
        return f"{chr(ord('a') + pos[1])}{rows - pos[0]}"

    @staticmethod
    def algebraic_to_coord(alg, rows):
        """'e4' -> (r, c)"""
        return (rows - int(alg[1]), ord(alg[0]) - ord('a'))

    @staticmethod
    def parse_fen_to_board(board, fen):
        """将 FEN 棋子部分加载到 Board 对象中"""
        parts = fen.split()
        if not parts: return
        placement = parts[0]
        
        # 初始化清空
        board.grid = [[None for _ in range(board.cols)] for _ in range(board.rows)]
        board.pieces = {Color.WHITE: set(), Color.BLACK: set()}
        board.king_pos = {Color.WHITE: None, Color.BLACK: None}
        
        rows_str = placement.split('/')
        char_to_class = {
            'p': Pawn, 'r': Rook, 'n': Knight, 'b': Bishop, 'q': Queen, 'k': King
        }
        
        for r, row_str in enumerate(rows_str):
            if r >= board.rows: break
            c = 0
            for char in row_str:
                if c >= board.cols: break
                if char.isdigit():
                    c += int(char)
                else:
                    color = Color.WHITE if char.isupper() else Color.BLACK
                    piece_class = char_to_class[char.lower()]
                    board._add_piece(piece_class, color, (r, c))
                    c += 1

    @staticmethod
    def generate_board_fen(board, turn):
        """生成 FEN 字符串"""
        res = []
        for r in range(board.rows):
            empty = 0
            row_str = ""
            for c in range(board.cols):
                p = board.grid[r][c]
                if p:
                    if empty:
                        row_str += str(empty)
                        empty = 0
                    row_str += str(p)
                else:
                    empty += 1
            if empty: row_str += str(empty)
            res.append(row_str)
        placement = "/".join(res)
        
        turn_str = "w" if turn == Color.WHITE else "b"
        
        # 易位权 (仅针对标准 8x8)
        castling = "-"
        if board.rows == 8 and board.cols == 8:
            castling = ""
            w_king = board.grid[7][4]
            if w_king and w_king.type == PieceType.KING and w_king.step == 0:
                r_h = board.grid[7][7]; r_a = board.grid[7][0]
                if r_h and r_h.type == PieceType.ROOK and r_h.step == 0: castling += "K"
                if r_a and r_a.type == PieceType.ROOK and r_a.step == 0: castling += "Q"
            b_king = board.grid[0][4]
            if b_king and b_king.type == PieceType.KING and b_king.step == 0:
                r_h = board.grid[0][7]; r_a = board.grid[0][0]
                if r_h and r_h.type == PieceType.ROOK and r_h.step == 0: castling += "k"
                if r_a and r_a.type == PieceType.ROOK and r_a.step == 0: castling += "q"
            if not castling: castling = "-"

        # 过路兵目标格
        ep_sq = "-"
        if board.last_move:
            start, end, piece = board.last_move
            if piece and piece.type == PieceType.PAWN and abs(start[0] - end[0]) == 2:
                row = (start[0] + end[0]) // 2
                ep_sq = f"{chr(ord('a') + start[1])}{board.rows - row}"
        
        return f"{placement} {turn_str} {castling} {ep_sq} 0 1"

    @staticmethod
    def parse_pgn(content):
        """解析 PGN 文本并返回 (起始FEN, 移动序列)"""
        fen_match = re.search(r'\[FEN\s+"([^"]+)"\]', content)
        start_fen = fen_match.group(1) if fen_match else "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        
        # 清理并提取移动序列
        move_text = re.sub(r'\[.*?\]', '', content, flags=re.DOTALL)
        move_text = re.sub(r'\{.*?\}', '', move_text, flags=re.DOTALL)
        move_text = re.sub(r'\(.*?\)', '', move_text, flags=re.DOTALL)
        move_text = re.sub(r'\d+\.+\s*', ' ', move_text)
        moves = [m for m in move_text.split() if m not in ["*", "1-0", "0-1", "1/2-1/2"]]
        
        return start_fen, moves

    @staticmethod
    def generate_pgn(history, winner, is_over):
        """生成 PGN 字符串"""
        pgn = ""
        for i in range(0, len(history), 2):
            pgn += f"{i//2 + 1}. {history[i]} "
            if i + 1 < len(history):
                pgn += f"{history[i+1]} "
        
        if not is_over: result = "*"
        else:
            result = "1-0" if winner == Color.WHITE else ("0-1" if winner == Color.BLACK else "1/2-1/2")
        return pgn + result

    @staticmethod
    def parse_san_to_move(san, turn, board):
        """将 SAN ('Nf3') 解析为 (start, target, promotion_choice)"""
        clean_san = san.rstrip('+#?! ')
        if clean_san == "O-O":
            row = board.rows - 1 if turn == Color.WHITE else 0
            return (row, 4), (row, 6), None
        if clean_san == "O-O-O":
            row = board.rows - 1 if turn == Color.WHITE else 0
            return (row, 4), (row, 2), None

        pattern = r'^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(=[QRBN])?'
        match = re.match(pattern, clean_san)
        if not match: return None, None, None
        
        p_char, d_file, d_rank, is_cap, target_str, promo = match.groups()
        target = NotationHandler.algebraic_to_coord(target_str, board.rows)
        p_type = PieceType(p_char) if p_char else PieceType.PAWN
        
        legal_moves = board.get_legal_moves(turn)
        for start, ends in legal_moves.items():
            if target not in ends: continue
            piece = board.grid[start[0]][start[1]]
            if not piece or piece.type != p_type: continue
            
            # 消歧检查
            if d_file and chr(ord('a') + start[1]) != d_file: continue
            if d_rank and str(board.rows - start[0]) != d_rank: continue
            
            p_choice = promo[1] if promo else None
            return start, target, p_choice
        return None, None, None
