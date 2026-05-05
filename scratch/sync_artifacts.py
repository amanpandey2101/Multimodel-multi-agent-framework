import requests
import json

SUPABASE_URL = "https://whfzvzkamjqnzpdfjgmf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoZnp2emthbWpxbnpwZGZqZ21mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0ODczMywiZXhwIjoyMDkwNzI0NzMzfQ.wG19Np98rtGQkFHsNcu7-3T3xpo62i4No-6uGTAtirU"
pipeline_id = "2247ddad-745b-4773-bd72-33be47f2c9dc"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# 1. Fetch artifacts
url = f"{SUPABASE_URL}/rest/v1/artifacts?pipeline_id=eq.{pipeline_id}&stage_name=eq.implementation&order=version.desc&limit=1"
response = requests.get(url, headers=headers)
artifact = response.json()[0]
print(f"Current implementation artifact ID: {artifact['id']}")

content = artifact['content']
files = content.get('files', [])

# 2. Update files
found_main = False
for f in files:
    if f['path'] == 'index.html':
        print("Found index.html, updating...")
        f['content'] = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calculator</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="./src/main.tsx"></script>
</body>
</html>"""
    if f['path'] == 'src/main.jsx':
        print("Found src/main.jsx, renaming to src/main.tsx and updating...")
        f['path'] = 'src/main.tsx'
        f['content'] = """import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(<App />, document.getElementById('app'));
"""
        found_main = True

if not found_main:
    print("src/main.jsx not found in files array, looking for src/main.tsx")
    for f in files:
        if f['path'] == 'src/main.tsx':
            print("Found src/main.tsx, updating...")
            f['content'] = """import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(<App />, document.getElementById('app'));
"""

# 3. Save back
update_url = f"{SUPABASE_URL}/rest/v1/artifacts?id=eq.{artifact['id']}"
resp = requests.patch(update_url, headers=headers, json={"content": content})
print(f"Update status: {resp.status_code}")
