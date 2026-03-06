import os
import json
import time

def generate_environment(image_path: str, output_dir: str):
    """
    Wrapper for ML-Sharp to generate 3D Gaussian Splats.
    """
    print(f"[ML-Sharp] Processing {image_path} on MPS...")
    
    # Simulate processing time for UX verification without full weights download
    time.sleep(2)
    
    # Write mock splats.ply
    splat_path = os.path.join(output_dir, "splats.ply")
    with open(splat_path, "w") as f:
        f.write("mock ply data for gaussian splats")
        
    # Write mock cameras.json
    cam_path = os.path.join(output_dir, "cameras.json")
    with open(cam_path, "w") as f:
        json.dump([{"id": 0, "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]}], f)
        
    # Write mock metadata.json
    meta_path = os.path.join(output_dir, "metadata.json")
    with open(meta_path, "w") as f:
        json.dump({"model": "ml-sharp-mps"}, f)
        
    print(f"[ML-Sharp] Output saved to {output_dir}")
    return output_dir
