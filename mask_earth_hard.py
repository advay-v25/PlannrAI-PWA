from PIL import Image, ImageDraw, ImageEnhance
import sys

# We use the original earth.png which has the continents
input_path = '/Users/advay/plannrai-web/public/earth.png'
output_path = '/Users/advay/plannrai-web/public/eclipsed_earth_transparent.png'

try:
    img = Image.open(input_path).convert("RGBA")
except Exception as e:
    print(f"Failed to open {input_path}: {e}")
    sys.exit(1)

width, height = img.size
# Create a strict circular mask
mask = Image.new("L", (width, height), 0)
draw = ImageDraw.Draw(mask)

# Radius needs to be tight to the planet. 0.46 of the width/height
radius = min(width, height) * 0.46
cx, cy = width / 2, height / 2

# Draw strict white circle with no blur
draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)

# Darken the earth so it doesn't wash out text
enhancer = ImageEnhance.Brightness(img)
img = enhancer.enhance(0.4)

# Apply mask directly
img.putalpha(mask)

# Crop the image to exactly the bounding box of the circle so the element itself is perfectly circular
# This removes all the blank space around the circle
box = (int(cx - radius), int(cy - radius), int(cx + radius), int(cy + radius))
img = img.crop(box)

img.save(output_path)
print("Successfully generated strict masked earth")
