
import shutil
import os
from pathlib import Path

def clean_and_reinstall():
    cli_dir = Path("e:/Projects/multi-agent/Major/cli")
    node_modules = cli_dir / "node_modules"
    yarn_lock = cli_dir / "yarn.lock"
    
    if node_modules.exists():
        print(f"Deleting {node_modules}...")
        shutil.rmtree(node_modules, ignore_errors=True)
    
    if yarn_lock.exists():
        print(f"Deleting {yarn_lock}...")
        os.remove(yarn_lock)
        
    print("Cleaned successfully.")

if __name__ == "__main__":
    clean_and_reinstall()
