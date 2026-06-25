from PIL import Image
import numpy as np

img = Image.open('/Users/advay/.gemini/antigravity-ide/brain/93c86c1b-f276-407e-b7d6-957c06f2e3eb/scratch/screenshot.png')
img_np = np.array(img)

# Print max color value and mean color value
print(f"Max: {np.max(img_np)}")
print(f"Mean: {np.mean(img_np)}")
if np.max(img_np) < 50:
    print("Image is very dark/black")
else:
    print("Image has bright content")
