# Contributing to PaketLab

Thank you for improving the simulator. Contributions should preserve accurate virtual-network behavior, user data and original TopoLab provenance.

## Core principles

- Do not remove, rename or silently rewrite TopoLab's original attribution. The original snapshot stays in `upstream/TopoLab/`.
- Preserve the original device catalog and existing topologies unless a tested, explicitly scoped change is necessary.
- A packet must use the actual virtual graph route; no fabricated "delivered" message when physically disconnected.
- Model vulnerability, spoofing or overload outcomes **only in-memory**. No real network scanning, exploitation or packet injection.
- Distinguish local host firewall policy from dedicated routed firewall policy. A Switch is not a network firewall.
- Normal packets must never silently change the virtual device's power state.
- Master mode should assess saved virtual state. Standard Lab must retain Easy Edit/Edit More.
- `.pklab` import/export must preserve mode, devices and tasks.
- Use accessible controls, responsive small-screen layout, consistent OLED/Veyra styling, and real functional screenshots.

## Tests

On Windows with Node.js installed:

```powershell
node tests_packetlab_core.js
node tests_packetlab_v06.js
```

With Python Playwright / installed Edge Chromium:

```powershell
python smoke_v06.py
python smoke_v06_extended.py
```

To build Android:

```powershell
.gradlew.bat :app:assembleDebug
```

Do not commit build outputs or secrets. Please include expected behavior, actual behavior, screenshots, version and relevant sanitized logs in your issue/PR.

## Project documentation

- [English README](README.md)
- [Deutsch](README.de.md)
- [Attribution & copyright](NOTICE.md)
- [Source history](upstream/TopoLab/)
