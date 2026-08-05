import os
import re

# =====================================================================
# ONE-CLICK PROJECT TO OBSIDIAN .MD CONVERTER
# =====================================================================

PROJECT_DIR = "."
OUTPUT_DIR = "./ObsidianDocs"

def clean_filename(title):
    return re.sub(r'[\\/*?:"<>|]', '_', title.strip())

def convert_twine_links(text):
    """Turns Twine macros into Obsidian [[Wikilinks]]"""
    text = re.sub(r'<<goto\s+["\']([^"\']+)["\']>>', r'[[ \1 ]]', text)
    text = re.sub(r'\[\[([^\|]+)\|([^\]]+)\]\]', r'[[\2|\1]]', text)
    return text

def main():
    print("🚀 Starting conversion to Obsidian .md files...")
    
    if os.path.exists(OUTPUT_DIR):
        import shutil
        shutil.rmtree(OUTPUT_DIR)

    converted_count = 0

    for root, dirs, files in os.walk(PROJECT_DIR):
        # Ignore git, vscode, and the output folder itself
        if any(ignore in root for ignore in ['.git', '.vscode', 'node_modules', 'ObsidianDocs']):
            continue

        for file in files:
            file_path = os.path.join(root, file)
            ext = os.path.splitext(file)[1].lower()

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
            except Exception:
                continue

            # 1. CONVERT TWEE / TWEE3 PASSAGES TO .MD
            if ext in ['.twee', '.tw']:
                passages = re.split(r'\n::\s*', content)
                for block in passages:
                    if not block.strip():
                        continue
                    lines = block.split('\n')
                    header = lines[0].strip()
                    title = re.split(r'[\{\[\n]', header)[0].replace('::', '').strip()

                    if not title:
                        title = "Untitled_Passage"

                    body = "\n".join(lines[1:])
                    body_converted = convert_twine_links(body)

                    target_folder = os.path.join(OUTPUT_DIR, "Passages")
                    os.makedirs(target_folder, exist_ok=True)

                    md_path = os.path.join(target_folder, f"{clean_filename(title)}.md")
                    with open(md_path, 'w', encoding='utf-8') as md:
                        md.write(f"# {title}\n\n```html\n{body_converted}\n```\n")
                    converted_count += 1

            # 2. CONVERT JAVASCRIPT SCRIPTS TO .MD
            elif ext == '.js':
                target_folder = os.path.join(OUTPUT_DIR, "Scripts")
                os.makedirs(target_folder, exist_ok=True)
                md_path = os.path.join(target_folder, f"{file}.md")
                with open(md_path, 'w', encoding='utf-8') as md:
                    md.write(f"# ⚙️ {file}\n\n```javascript\n{content}\n```\n")
                converted_count += 1

            # 3. CONVERT CSS STYLES TO .MD
            elif ext == '.css':
                target_folder = os.path.join(OUTPUT_DIR, "Styles")
                os.makedirs(target_folder, exist_ok=True)
                md_path = os.path.join(target_folder, f"{file}.md")
                with open(md_path, 'w', encoding='utf-8') as md:
                    md.write(f"# 🎨 {file}\n\n```css\n{content}\n```\n")
                converted_count += 1

            # 4. COPY EXISTING MARKDOWN FILES (like FullGameCode.md)
            elif ext == '.md' and 'convert_to_obsidian' not in file:
                target_folder = os.path.join(OUTPUT_DIR, "Docs")
                os.makedirs(target_folder, exist_ok=True)
                md_path = os.path.join(target_folder, file)
                with open(md_path, 'w', encoding='utf-8') as md:
                    md.write(content)
                converted_count += 1

    print(f"✅ Success! Converted {converted_count} files into pure .md files in './ObsidianDocs'")

if __name__ == "__main__":
    main()