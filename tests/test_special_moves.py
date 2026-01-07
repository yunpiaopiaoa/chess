
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.logic.game import Game
from backend.logic.constants import Color, PieceType

def test_promotion_undo():
    print("Testing Promotion and Undo...")
    game = Game()
    # 设置一个即将升变的局面 (White Pawn at a7, Black King at h8)
    game.load_fen("7k/P7/8/8/8/8/8/K7 w - - 0 1")
    print("Initial FEN:", game.fen_history[-1])
    
    # 执行升变移动 a7 -> a8 (Q)
    # (1, 0) 是 a7, (0, 0) 是 a8
    success, msg = game.make_move((1, 0), (0, 0), promotion_choice="Q")
    print(f"Move a7->a8: {success}, {msg}")
    print("Current FEN:", game.fen_history[-1])
    
    piece = game.board.grid[0][0]
    print(f"Piece at a8: {piece.type} ({piece.color})")
    assert piece.type == PieceType.QUEEN
    
    # 模拟 Undo (虽然 Game.py 还没暴露 undo，但我们可以直接测试 Board)
    last_move = game.board.last_move
    print("Undoing move...")
    last_move.undo(game.board)
    
    old_pawn = game.board.grid[1][0]
    print(f"Piece at a7: {old_pawn.type if old_pawn else 'None'} ({old_pawn.color if old_pawn else 'N/A'})")
    assert old_pawn.type == PieceType.PAWN
    print("Promotion Undo Test Passed!")

def test_en_passant():
    print("\nTesting En Passant...")
    game = Game()
    # 设置过路兵局面
    # 模拟黑方上一步走了 d7 -> d5
    game.load_fen("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2")
    
    from backend.logic.move import Move
    black_pawn = game.board.grid[3][3] # d5
    # 伪造一个 last_move 使得白棋可以吃过路兵
    game.board.last_move = Move((1, 3), (3, 3), black_pawn) # d7 -> d5
    
    white_pawn_pos = (3, 4) # e5
    target_pos = (2, 3)     # d6
    
    success, msg = game.make_move(white_pawn_pos, target_pos)
    print(f"En Passant Move: {success}, {msg}")
    
    # 检查被吃的黑兵是否消失
    captured_pos = (3, 3) # d5
    assert game.board.grid[captured_pos[0]][captured_pos[1]] is None
    print("En Passant Capture Successful!")
    
    # Undo
    last_move = game.board.last_move
    last_move.undo(game.board)
    print("Undoing En Passant...")
    assert game.board.grid[white_pawn_pos[0]][white_pawn_pos[1]].type == PieceType.PAWN
    assert game.board.grid[captured_pos[0]][captured_pos[1]].type == PieceType.PAWN
    print("En Passant Undo Test Passed!")

if __name__ == "__main__":
    try:
        test_promotion_undo()
        test_en_passant()
        print("\nAll special moves tests passed!")
    except Exception as e:
        print(f"\nTest failed: {e}")
        import traceback
        traceback.print_exc()
