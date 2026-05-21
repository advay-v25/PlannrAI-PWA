from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import sys

try:
    input_path = '/Users/advay/plannrai-web/public/earth.png'
    img = Image.open(input_path).convert("RGBA")
except:
    input_path = '/Users/advay/plannrai-web/public/eclipsed_earth.png'
    img = Image.open(input_path).convert("RGBA")

width, height = img.size
mask = Image.new("L", (width, height), 0)
draw = ImageDraw.Draw(mask)

radius = min(width, height) * 0.48
cx, cy = width / 2, height / 2
draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(15))

enhancer = ImageEnhance.Brightness(img)
img = enhancer.enhance(0.4)

img.putalpha(mask)
img.save('/Users/advay/plannrai-web/public/eclipsed_earth_transparent.png')
print("Successfully generated masked and darkened earth")
