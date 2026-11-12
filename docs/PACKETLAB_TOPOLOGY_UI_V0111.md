# PacketLab 0.11.1: Topology and Building UI

## Design

The top topology dropdown uses the current PacketLab lab.preset, which preserves extended names after an underlying TopoLab regeneration. Its 18 cards have SVG icons and a shared numeric device-count field, with standard size chips. Built-in topology generators accept 3 through 40 devices. Extended Home/DMZ/Mobile/School and other template types also accept custom sizes; the special Office/Campus/Datacenter/Dual templates resize while preserving as many original device roles and links as possible.

The optional Building button is appended at the bottom of the device library and always starts disabled, including after reloading a saved world. Its SVG icon and the Studio and book SVGs are independent of font glyph support. The header version chip is removed to prevent icon overlap.

## Regression

40 mobile Chromium UI tests check listed topology choices, size changes, stored selection names, optional building toggles, SVG symbols and prior Net@Lab/Training workflows. The 30 existing model tests and Android debug build pass.
