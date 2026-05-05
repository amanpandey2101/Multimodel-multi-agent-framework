
from backend.app.supabase_client import get_supabase
import json

def fix_deployment_artifact():
    supabase = get_supabase()
    pipeline_id = "2247ddad-745b-4773-bd72-33be47f2c9dc"
    res = supabase.table("artifacts").select("*").eq("pipeline_id", pipeline_id).eq("artifact_type", "deployment").execute()
    if res.data:
        art = res.data[0]
        content = art['content']
        
        if 'dockerfile' in content:
            # Comprehensive fix for Dockerfile
            dockerfile = content['dockerfile']
            # Ensure we copy everything
            dockerfile = dockerfile.replace("COPY vite.config.js .", "")
            dockerfile = dockerfile.replace("COPY src ./src", "COPY . .")
            # Remove problematic lines
            lines = dockerfile.split('\n')
            dockerfile = '\n'.join([l for l in lines if 'COPY nginx.conf' not in l and 'USER nginx' not in l])
            content['dockerfile'] = dockerfile
        
        if 'docker_compose' in content:
            # Fix port mapping for IDE preview
            content['docker_compose'] = content['docker_compose'].replace("'3000:80'", "'3001:80'").replace('"3000:80"', '"3001:80"')

        supabase.table("artifacts").update({"content": content}).eq("id", art['id']).execute()
        print("Fixed deployment artifact (Removed USER nginx + Copy all files + removed nginx.conf dependency + fixed port mapping)")

if __name__ == "__main__":
    fix_deployment_artifact()
