import os
import sys

# 将项目根目录添加到路径以便导入
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.logic.board import Board
from backend.logic.constants import Color

def test_moves():
    board = Board()
    print("Initial Board:")
    print(board)
    
    # 获取白方的所有合法移动
    white_moves = board.get_legal_moves(Color.WHITE)
    print(f"\nTotal pieces for White that can move: {len(white_moves)}")
    
    # 模拟一个兵的移动 e2 to e4
    # e2 is (6, 4) in 0-indexed grid
    print("\nMoving e2 to e4 (6,4 -> 4,4)...")
    board.move_piece((6, 4), (4, 4))
    print(board)
    
    # 再次检查黑方的合法移动
    black_moves = board.get_legal_moves(Color.BLACK)
    print(f"Total pieces for Black that can move: {len(black_moves)}")

if __name__ == "__main__":
    test_moves()
