# Changelog

## [0.11.1] — 2026-11-12

### Fixed
- Building mode at end of devices list, disabled on app launch and saved-world load.
- All 18 templates accessible through one top picker with working device size and auto-fit.
- Selected topology name correctly follows extended templates, including save/load.
- Replaced overlapping book/version label and duplicated lightning glyphs with stable SVGs.
- Preserved existing virtual network, learning and storage modules.

### Verification
- 40 mobile Chromium UI/regression checks, 12 core and 18 network-model tests, successful Android Gradle build.


## [0.11.0] — 2026-11-12

### Training & Net@Lab
- One playable, simulated exercise for each Net@Lab chapter, with course overview, intentional Start and four difficulties.
- Difficulty-adjusted baseline configurations: one to four independent goals and zero to three hints per task.
- The book icon opens objectives and mini tips in a running training; the encyclopedia remains separately accessible.
- 20 Fundamentals and 20 IPv4 articles, including complete worked subnetting and VLSM examples. Total: 90 chapters.

### Touch and navigation fixes
- Removed the additional fifth bottom tab: stable single four-tab row in Network, Builder and Training.
- Removed legacy CANVAS menu on empty canvas.
- Replaced free-lab long-press Quick Edit with a compact, deliberate move/dwell/release gesture that cannot select before finger movement.
- Preserved device/cable context menus and existing .worklab/.pklab libraries.

### Verification
- Original core/model test suites, mobile Chromium chapter/training/gesture/geometry tests and Android debug build.


## [0.10.0] — 2026-11-12

### Net@Lab V2 interactive education

- Rebuilt the offline networking handbook as a structured 62-chapter VeyraLabs learning academy with 15 topics, category navigation, search, reading history and bookmarks.
- Added per-chapter learning goals, well-spaced technical explanations, quick visual reference cards, command examples, typical failure analysis and related chapters.
- Contextual read-only example networks for subnetting, IPv6, DHCP, DNS, VLAN switching, ARP, routing, NAT, firewall, WLAN, Linux, Windows and Cisco IOS.
- Click PC/router/switch/server/phone examples to inspect IP configuration, interfaces, MAC addresses, subnet masks, gateways, DNS, routes, firewall rules, services and model logs without editing.
- Multi-step packet flow with highlighted physical links and contextual layer descriptions.
- Read-only "Mein Lab" option to inspect existing virtual graph state without modifying any world data.
- Reworked responsive OLED reading UI and touch controls, removed native Android select dependency in the handbook.
- Preserved legacy Net@Lab reading progress/bookmarks, existing PacketLab user worlds and network engine.

### Validation

- 21 mobile Chromium UI/regression checks including rendering all 62 lessons and verifying demo/live views cannot modify the lab.
- Existing 12+18 network model suites and Gradle Android debug build.


## [0.9.0] — 2026-11-12

### Added

- Network Lab, Network Training Builder and Network Lab Training, each with a separate local library and project import/export, open, delete and clone-to-edit for authored training files.
- Multi-level training builder with expected device state, captured baseline, goal comparison, point-based grading and templates ready to edit or play.
- Editable .pklab plus read-only-in-UI .worklab dual export, initial taskbook overlay, clone-for-editing workflow.
- Net@Lab by VeyraLabs: 62 original offline networking chapters, category search, read progress and bookmarks.
- Unified packet composer with custom Veyra dropdown and direct source/target selection, old duplicate route/source rows removed.
- Redesigned first firewall configurator with ordered CIDR, protocol and port-range rules, rate/burst settings, logs and editing.
- Distinct Device Inspector and Network Analysis pages for per-device activity and global faults/statistics.
- Haptic feedback for navigation, confirmation and sheet closing.
- Free-lab-only touch hold Quick Edit with device categories, Repair Network, staged Smart Fix and Building Agent submenus.
- Native Android opt-in Wi-Fi/mDNS discovery of current network, nearby Wi-Fi and advertised local services. No background IP sweeps.
- 2D room/floor editor with room resizing, hallways, staircases and floor arrows. No fake 3D.

### Compatibility

- Existing TopoLab/PacketLab graph, saved .pklab project format, virtual terminals and device configuration remain available.
- Educational simulator only: no real Cisco IOS, Linux, Windows, Android or iOS OS execution.
- Passive discovery does not guarantee a full physical device inventory.
- App package ID and debug certificate remain consistent with 0.8.0.

### Validation

- Original 12 core tests and 18 v0.6 model tests.
- Mobile Chromium workflows covering packet controls, handbook, firewall, inspector/analysis, dual export, worklab playback/clone, Quick Edit scope, building floor and scanner consent.
- Native Android Java compile and Gradle debug APK build.


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
