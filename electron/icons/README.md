# Lavira Media — App Icons

Place your production icon files here. The CI build generates green-square placeholders automatically if these are missing, but for a proper branded release you should provide:

| File | Size | Used for |
|---|---|---|
| `icon.png` | 512×512 px | Linux AppImage, general |
| `icon.ico` | multi-size (256,128,64,48,32,16) | Windows installer + taskbar |
| `icon.icns` | multi-size | macOS DMG + dock |
| `installer-header.bmp` | 150×57 px | Windows NSIS installer banner (optional) |
| `dmg-background.png` | 540×400 px | macOS DMG background (optional) |
| `entitlements.plist` | — | macOS hardened runtime (auto-generated in CI) |

## Generating icons from a single PNG

If you have `icon.png` at 512×512, install these tools once:

```bash
# macOS
npm install -g electron-icon-maker
electron-icon-maker --input=icon.png --output=./

# Windows / Linux
npm install -g png-to-ico
png-to-ico icon.png > icon.ico
```

Or use [https://www.electron.build/icons](https://www.electron.build/icons) online.

## Lavira brand colours

- Primary green:  `#2D6A4F`
- Accent amber:   `#F4A261`
- Dark background:`#0F1C17`
