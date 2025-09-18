# Device Images Workflow

This guide explains how to generate the **device images** used on the site.  
Every supported device requires **three images** derived from a single transparent PNG source.

- **Large:** `1000x400`
- **Small:** `250x100`
- **Small + Drop Shadow:** `314x164` (LEGACY)

All processing is done in **GIMP**.

---

## 1. Prepare the Large Image (`-large`)

1. Open the source PNG (must have a transparent background).
2. **Crop tightly**:
    - Use the crop tool to remove excess transparent space.
    - Leave only a few pixels of transparency around the edges.
3. **Scale the image width**:
    - Go to `Image → Scale Image…`.
    - Set **Width = 1000 px** (keep aspect ratio locked).
    - Height will scale proportionally.
4. **Set canvas size**:
    - Go to `Image → Canvas Size…`.
    - Set **Height = 400 px**.
    - Click the **Center** button to ensure the device is vertically centered.
    - Apply resize.
5. **Export**:
    - `File → Export As…`
    - Save as PNG with **Compression = 9**.
    - Use the naming convention:
      ```
      <vendor>-<device>-large.png
      ```
      Example: `valve-steam-deck-large.png`

---

## 2. Create the Small Image (`-small`)

1. From the large image, go to `Image → Scale Image…`.
2. Set **Width = 250 px** (keep aspect ratio locked).
    - Height will automatically scale to **100 px**.
3. **Export**:
    - Save as PNG with **Compression = 9**.
    - Use the naming convention:
      ```
      <vendor>-<device>-small.png
      ```
      Example: `valve-steam-deck-small.png`

---

## 3. [LEGACY - not needed any more] Create the Small Image with Drop Shadow (`-small-shadow`)

1. With the small image open, go to:  
   `Filters → Light and Shadow → Drop Shadow (legacy)`
2. Apply the following settings:
    - **Offset X:** `20`
    - **Offset Y:** `20`
    - **Blur Radius:** `15`
    - **Grow Radius:** `0`
    - **Color:** Black
    - **Opacity:** `60`
    - **Allow Resizing:** ✓ Enabled
3. This should produce an image ~`285x135 px`.
4. Adjust canvas size:
    - Go to `Image → Canvas Size…`.
    - Set to **314x164 px**.
    - Click **Center** to center the image.
    - Click **Resize**.
5. **Export**:
    - Save as PNG with **Compression = 9**.
    - Use the naming convention:
      ```
      <vendor>-<device>-small-shadow.png
      ```
      Example: `valve-steam-deck-small-shadow.png`

---

## Notes

- Always start with a **large, high-quality source PNG** with a transparent background.
- The **Drop Shadow (legacy)** filter is required. In recent GIMP versions, the modern filter has replaced it, but the `(legacy)` version gives the correct results.  
- The **-shadow** images are no longer required as this is now done in CSS.
