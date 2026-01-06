import os
import sys

# 将项目根目录添加到路径以便导入
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.logic.board import Board

def test():
    board = Board()
    print("Chess Board Initialization:")
    print(board)

if __name__ == "__main__":
    test()
