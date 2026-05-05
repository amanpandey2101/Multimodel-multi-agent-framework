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

url = f"{SUPABASE_URL}/rest/v1/artifacts?pipeline_id=eq.{pipeline_id}&stage_name=eq.implementation&order=version.desc&limit=1"
response = requests.get(url, headers=headers)
artifact = response.json()[0]
content = artifact['content']
files = content.get('files', [])

for f in files:
    path = f.get('path', '')
    if path == 'vite.config.js':
        print("Updating vite.config.js with base: './'")
        f['content'] = """import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    base: './'
});
"""

content['files'] = files
update_url = f"{SUPABASE_URL}/rest/v1/artifacts?id=eq.{artifact['id']}"
resp = requests.patch(update_url, headers=headers, json={"content": content})
print(f"Final Update Status (with Vite base): {resp.status_code}")
