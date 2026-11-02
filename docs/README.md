# PaketLab Website

The public project website is served by GitHub Pages from the `docs/` directory on `main`:

https://ctrl-mietze.github.io/Packetlab/

Includes:

- Responsive dark-violet product page, feature sections, learning overview, screenshots and direct APK release download.
- German and English text switching in `site.js`.
- Real v0.6.0 browser/WebView screenshot assets.
- Original decorative network diagram rendered with HTML/CSS/SVG.
- A collapsed TopoLab provenance accordion at the bottom, preserving original author credit.

To preview locally:

```powershell
cd docs
python -m http.server 8080
```

Then open `http://localhost:8080`. The website doesn't need a JavaScript build system.

All security/vulnerability content describes synthetic, in-memory-only simulations. No actual attack traffic or real Cisco/IOS emulation is advertised.
