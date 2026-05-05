from backend.app.supabase_client import get_supabase
import json

supabase = get_supabase()
pipeline_id = "2247ddad-745b-4773-bd72-33be47f2c9dc"

result = supabase.table("artifacts").select("*").eq("pipeline_id", pipeline_id).execute()
for art in result.data:
    print(f"Artifact: {art['stage_name']} (ID: {art['id']})")
    # print(json.dumps(art['content'], indent=2))
