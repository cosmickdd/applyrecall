import zlib
import struct
from pathlib import Path

def create_png(width: int, height: int, rgba_color: tuple) -> bytes:
    """Generates a raw valid PNG byte stream for a solid rounded-look icon."""
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk (raw pixel data with filter byte per scanline)
    raw_data = bytearray()
    r, g, b, a = rgba_color
    
    # Simple icon drawing: Blue background (#2142E7 = 33, 66, 231) with white center symbol
    for y in range(height):
        raw_data.append(0) # filter type 0
        for x in range(width):
            # Check if in center "A" or bookmark shape
            cx = x / width
            cy = y / height
            # Rounded corner mask
            dist_x = max(0, abs(cx - 0.5) - 0.35)
            dist_y = max(0, abs(cy - 0.5) - 0.35)
            in_bounds = (dist_x*dist_x + dist_y*dist_y) < 0.02
            
            # Draw white inner mark
            is_mark = (0.35 <= cx <= 0.65) and (0.3 <= cy <= 0.7) and (
                (0.45 <= cx <= 0.55) or (0.45 <= cy <= 0.55) or (cy - cx > 0.05 and cx < 0.5) or (cx + cy > 0.95 and cx > 0.5)
            )
            
            if in_bounds:
                if is_mark:
                    raw_data.extend((255, 255, 255, 255))
                else:
                    raw_data.extend((33, 66, 231, 255))
            else:
                raw_data.extend((0, 0, 0, 0))
                
    compressed = zlib.compress(bytes(raw_data), level=9)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    return png

icons_dir = Path("c:/Users/ASUS/Downloads/applyrecall/extension/icons")
icons_dir.mkdir(parents=True, exist_ok=True)

for size in [16, 32, 48, 128]:
    png_bytes = create_png(size, size, (33, 66, 231, 255))
    (icons_dir / f"icon{size}.png").write_bytes(png_bytes)

print("Icons generated successfully!")
