import os
import re

search_dir = r"d:\67152470103"
pattern = re.compile(r'\s*<div class="cyber-floating-menu" id="cyber-nav-menu">.*?</div>\n', re.DOTALL)

count = 0
for root, _, files in os.walk(search_dir):
    for filename in files:
        if filename.endswith(".html"):
            filepath = os.path.join(root, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content, num_replacements = pattern.subn('', content)
            if num_replacements > 0:
                with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(new_content)
                count += 1
                print(f"Fixed: {filepath}")

print(f"Total files fixed: {count}")
