import re

with open(r'C:\Users\Ducbv\.gemini\antigravity\brain\bd67975a-acb4-4a7b-947f-d1c370182b00\.system_generated\steps\178\content.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern for Google Sheets JSON data containing sheet IDs and names
# Look for structures like: [1,0,"1823144076",[{"1":[[0,0,"Aging"]
pattern = r'\[\d+,\d+,\"(\d+)\",\[\{\"1\":\[\[0,0,\"([^\"]+)\"'
matches = re.findall(pattern, content)

for gid, name in matches:
    print(f"{name}: {gid}")
