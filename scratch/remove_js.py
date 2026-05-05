
import os
import re
from pathlib import Path

def remove_js_extensions():
    src_dir = Path("e:/Projects/multi-agent/Major/cli/src")
    pattern = re.compile(r"(from\s+['\"](?:\.\/|\.\.\/).*?)\.js(['\"])")
    
    count = 0
    for root, _, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = Path(root) / file
                content = filepath.read_text(encoding='utf-8')
                new_content = pattern.sub(r"\1\2", content)
                if new_content != content:
                    filepath.write_text(new_content, encoding='utf-8')
                    print(f"Updated {filepath}")
                    count += 1
                    
    print(f"Finished updating {count} files.")

if __name__ == "__main__":
    remove_js_extensions()
