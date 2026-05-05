
from backend.app.supabase_client import get_supabase
import json

def check_deployment_artifact():
    supabase = get_supabase()
    pipeline_id = "2247ddad-745b-4773-bd72-33be47f2c9dc"
    res = supabase.table("artifacts").select("*").eq("pipeline_id", pipeline_id).eq("artifact_type", "deployment").execute()
    if res.data:
        print(json.dumps(res.data[0]['content'], indent=2))

if __name__ == "__main__":
    check_deployment_artifact()
