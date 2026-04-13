# Relativistic Observer VR Demo

This is a plain static Three.js + WebXR project.

## Files

- `index.html`
- `main.js`
- `README.md`

## Important

This version imports Three.js from a CDN, so your computer and your Quest headset both need an internet connection when loading the page.

## Desktop run

1. Open the folder in VS Code.
2. Right-click `index.html`.
3. Choose **Open with Live Server**.
4. Desktop controls:
   - click the scene to lock the mouse
   - `WASD` move
   - `Q` / `E` down / up
   - mouse = look
   - `Shift` = faster
   - `Esc` releases the mouse

## Quest 3 run

WebXR immersive VR needs HTTPS, so for the headset the easiest route is to host this as a static site on GitHub Pages.

### GitHub Pages steps

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. Open the repository on GitHub.
4. Go to **Settings** -> **Pages**.
5. Under **Build and deployment**:
   - **Source** = `Deploy from a branch`
   - **Branch** = `main`
   - **Folder** = `/ (root)`
6. Save.
7. Wait for GitHub to publish the site.
8. GitHub will show an HTTPS URL for the site.

### In the Quest 3 headset

1. Put on the headset.
2. Open the built-in **Browser** app.
3. Visit the GitHub Pages HTTPS URL.
4. Wait for the page to load.
5. Press **Enter VR**.
6. If the browser asks for immersive-web permissions, allow them.

### VR controls

- Left thumbstick = move / strafe in headset look direction (including up/down if you look up/down)
- Right thumbstick left-right = turn
- Right thumbstick up-down = fly up / down

## Notes

- The center blue cube marks the observer position at the origin.
- Relativistic distortion is computed relative to that fixed observer position, not your current camera location.
- The beta slider changes `v/c`.
- There are now two separate toggles:
  - **Lorentz transform** = length contraction only
  - **Aberration** = retarded-position shift only

Additional tweaks in this build:
- Moving relativistic meshes are double-sided and frustum culling is disabled for them.
- Moving primitives use a procedural checker pattern based on their existing colors.
- Box primitives now use `3 x 3 x 3` segmentation.
- Capsule primitives now have more vertical subdivisions.
