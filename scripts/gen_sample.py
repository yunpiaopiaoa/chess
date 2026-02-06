import json
import os
import sys

# 将项目根目录添加到路径以便导入
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(root_dir)
os.chdir(root_dir)

from backend.logic.game import Game

def create_scholar_mate():
    game = Game()
    
    # 四回合杀 (Scholar's Mate)
    # 1. e4 e5
    game.make_move((6, 4), (4, 4))
    game.make_move((1, 4), (3, 4))
    
    # 2. Bc4 Nc6
    game.make_move((7, 5), (4, 2))
    game.make_move((0, 1), (2, 2))
    
    # 3. Qh5 Nf6?
    game.make_move((7, 3), (3, 7))
    game.make_move((0, 6), (2, 5))
    
    # 4. Qxf7#
    game.make_move((3, 7), (1, 5))
    
    # 确保目录结构符合新版规范
    game_id = "scholar_mate_sample"
    game_dir = os.path.join("saved_games", game_id)
    if not os.path.exists(game_dir):
        os.makedirs(game_dir)
        
    filename = os.path.join(game_dir, "game_data.json")
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(game.get_state_dict(), f, indent=2, ensure_ascii=False)
        
    print(f"测试棋谱已按照新版结构创建: {filename}")

if __name__ == "__main__":
    create_scholar_mate()
