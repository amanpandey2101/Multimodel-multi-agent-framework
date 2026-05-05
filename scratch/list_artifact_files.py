
from backend.app.supabase_client import get_supabase
import json

def list_all_artifact_files():
    supabase = get_supabase()
    pipeline_id = "2247ddad-745b-4773-bd72-33be47f2c9dc"
    res = supabase.table("artifacts").select("*").eq("pipeline_id", pipeline_id).execute()
    for art in res.data:
        print(f"Artifact Type: {art['artifact_type']}")
        content = art['content']
        if isinstance(content, dict):
            files = content.get('files', [])
            if isinstance(files, list):
                for f in files:
                    print(f"  - {f.get('path')}")
            else:
                 for path in content.keys():
                      print(f"  - {path}")

if __name__ == "__main__":
    list_all_artifact_files()
