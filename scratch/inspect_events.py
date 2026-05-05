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

url = f"{SUPABASE_URL}/rest/v1/events?pipeline_id=eq.{pipeline_id}&event_type=eq.critic_iteration&order=created_at"
response = requests.get(url, headers=headers)
events = response.json()

print(f"Found {len(events)} critic events")
for ev in events:
    print(f"Iteration {ev['data'].get('iteration')}: {ev['message']}")
    # print(json.dumps(ev['data'], indent=2))
