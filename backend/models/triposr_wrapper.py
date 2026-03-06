import os
import time

def generate_asset(image_path: str, output_dir: str):
    """
    Wrapper for TripoSR to generate a mesh asset.
    """
    print(f"[TripoSR] Generating asset from {image_path} on MPS...")
    
    # Simulate processing time for UX verification without full weights download
    time.sleep(2)
    
    # Write mock mesh.glb
    glb_path = os.path.join(output_dir, "mesh.glb")
    with open(glb_path, "w") as f:
        f.write("mock glb data")
        
    # Write mock texture.png
    tex_path = os.path.join(output_dir, "texture.png")
    with open(tex_path, "w") as f:
        f.write("mock png data")
        
    # Write mock preview.png
    prev_path = os.path.join(output_dir, "preview.png")
    with open(prev_path, "w") as f:
        f.write("mock preview png data")
        
    print(f"[TripoSR] Asset saved to {output_dir}")
    return output_dir
