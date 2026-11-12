# Changelog

## [0.8.0] — 2026-11-12

### Changed
- The device sheet is now owned by a single DOM component with independent icons, rows and action handlers, so legacy menu decorators cannot draw placeholder tiles.
- Cohesive OLED design language across sheets, navigation, simulator controls, inspector and terminal.

### Added
- Per-device OS selector: Windows, Linux/OpenWrt, Android, iOS and Cisco IOS models.
- Stateful virtual OS file trees with bounded file creation/read/write/copy/move/delete, directories and process listings.
- Service model with Start/Stop/Status wired to existing virtual service flags.
- Virtual Android package/settings commands; virtual iOS sysctl/network commands; Cisco version/NVRAM commands.
- Per-OS virtual terminals with context prompts, quick commands, local output and command history.
- Separate per-OS virtual filesystems saved to the existing .pklab project format.

### Tests
- Original 12+18 model tests remain successful.
- New responsive browser tests verify the new device menu, each supported OS and world-file persistence.
- Android Gradle APK build verified.


## [0.7.1] — 2026-11-12

### Fixed

- Device action rows: corrected conflict between the v0.5 grid decorator and v0.7 nested flex layout. No more empty purple rectangles, double icons, or displaced labels.
- Software Firewall: removed special colored background/outline in favor of the same neutral list-row styling as Terminal and Device Log.
- Added matching icons for firewall, module, services, phone and move actions.
- Regression test validates each new menu row has exactly one icon, correct grid structure, no extra border and transparent background.


## [0.7.0] — 2026-11-12

### Added

- Touch-safe placement and explicit move mode; optional series placement, conservative scroll gestures and Android WebView zoom restrictions outside canvas.
- Network Studio, 18 topology presets, task-to-topology picker, Network Guide with IPv4 subnetting calculator.
- Device module manager; Android/iOS profiles; virtual root/repeater only with Crazy Mode.
- Firewall Studio PRO: CIDR, port ranges, rule ordering, rate/burst/inspection, logs.
- Inspector, diagnostic Analysis, OSI/PDU hop trace and filterable event logs.
- Virtual OS-specific command aliases for Cisco IOS, Windows, Android and iOS.
- Quick send with collapsed packet console; top-right Play/Stop without displayed timer; safe back/exit.
- Optional benign periodic ICMP communication, never autonomous security tests.

### Correctness / Compatibility

- Contiguous netmask and gateway checks; per-device hardware/interface transmission constraints.
- Smartphone symbols distinct from laptops; mobile preset uses AP wireless links, not phones as transit routers.
- Preserves existing v0.6/TopoLab source files, network controls and .pklab v3 world format.
- Android v0.6/v0.7 debug signing certificate digests match.
- Cisco feature comparison documents supported, partial and unsupported simulation features.

### Verification

- 12 core tests; 18 v0.6 model tests; 26 mobile Chromium UI smoke checks with zero JavaScript exceptions; Gradle Android build.


## [0.6.0] — 2026-11-02

### Added

- **Build a Network** starts with an empty workspace while preserving previous drafts and original topology tools.
- **Learning entry** supports save/export, local drafts, explicit discard, new tasks, imported or stored `.pklab`, and nine exercise starter presets.
- **Network Master** includes percentage progress, extended task evaluation and CLI-first device menus; Standard Lab retains Easy Edit/Edit More.
- **Packet Console** with foldable responsive dock, visual two-tap source/destination picker, protocol/port/size/frame controls, spoof/evasion flags and LAN vs WAN selection.
- Deterministic **PacketLabV06** virtual delivery engine, firewall policy evaluation, per-device/source/destination logging and explicit modeled threat effects.
- **Host firewall** and **network firewall** graphical editor with default policy, ordered rules, anti-spoofing/inspection, virtual burst/rate limits and terminal rules.
- **Long virtual upload/download flows** with rate, duration, progress and logging.
- Responsive portrait/landscape refinements and in-app collapsed TopoLab credits.
- Public website with screenshots captured from actual v0.6 browser UI.

### Changed

- Simulation starts by default and may be paused/resumed.
- Unrequested periodic background-generated packets are disabled by default. Boot/ARP/DHCP-style events and user-configured flows are still modeled.
- The ordinary packet send path and older extended packet browsers now use deterministic model events and per-device logging.
- Virtual WAN requires an explicitly connected gateway/uplink rather than treating an Internet flag alone as connectivity.
- Existing TopoLab graph algorithms, source files, project history and device styles remain intact.

### Tests

- 12 original model tests passed.
- 18 additional v0.6 engine tests passed.
- 35 responsive/browser smoke assertions passed.
- 15 advanced device picking and firewall integration assertions passed.
- Android Gradle debug build successful.

### Limits

The educational model does not start actual Cisco IOS or Linux VMs, generate raw Ethernet captures, execute exploits or contact outside hosts. Simulations should not be equated to production firewall/network validation.

## [0.5.0] — 2026-10-27

- Navigation and action icons, cable wiring, terminal extension and desktop/landscape refinements.
- Undo/redo, deletions and device-specific virtual CLI commands.

## [0.4.0] — 2026-10-27

- Expanded packet selection, device catalogs and cable media support.

## [0.3.0] — 2026-10-27

- Added virtual profiles, network model and modes on top of the original TopoLab foundation.
