import requests
import json

SUPABASE_URL = "https://whfzvzkamjqnzpdfjgmf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoZnp2emthbWpxbnpwZGZqZ21mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE0ODczMywiZXhwIjoyMDkwNzI0NzMzfQ.wG19Np98rtGQkFHsNcu7-3T3xpo62i4No-6uGTAtirU"
pipeline_id = "024b19b6-1370-403e-bfb0-44aae060a0dc"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

url = f"{SUPABASE_URL}/rest/v1/artifacts?pipeline_id=eq.{pipeline_id}&order=created_at"
response = requests.get(url, headers=headers)
artifacts = response.json()

print(f"Found {len(artifacts)} artifacts")
for art in artifacts:
    print(f"- {art['stage_name']} (v{art['version']})")
    if art['stage_name'] == 'critic':
        print(f"  Feedback: {json.dumps(art['content'].get('feedback', ''), indent=2)}")
