# Network Lab Training 0.11.0

Network Lab Training is a distinct catalog of playable .worklab scenarios. The Net@Lab book continues to contain only reference articles and read-only demonstrations. The title mapping is one-to-one with the encyclopedia, but the exercise descriptions, objectives and start actions are exclusive to Training.

## Starting a course

Open **Network Lab Training** from the mode picker. Select **Training öffnen**, browse or search a chapter, read the short overview, select one of four difficulty levels, then start.

- Einfach: one objective, three progressively explicit hints, most settings preconfigured.
- Normal: two objectives, two hints.
- Fortgeschritten: three objectives, one hint.
- Experte: four objectives, no hints.

Each scenario creates a self-contained star network and makes one or more explicit changes to otherwise valid virtual configuration. The objectives are evaluated by the existing PacketLab engine and initially should all be unsatisfied.

The difficulty level changes how many parameters are deliberately missing and how many hints are offered. It does not add undocumented runtime modifications to real hardware.

## The book in a running training

The book icon in the main header opens **Aufgaben & Tipps**. This sheet includes objectives, progress and the hints allowed by difficulty. A separate button opens Net@Lab itself. No course list or status overlay is added to the original handbook. The extra fifth bottom navigation tab is removed.

## Quick Edit gesture

Free Network Lab only. Press on an empty canvas location and hold. When the compact Quick Edit panel appears, nothing is selected. Move at least 15 px to a category, remain there briefly, continue to a submenu item, remain there briefly and release to execute. If no item is fully armed, nothing happens. Builder and Training intentionally do not open Quick Edit. Device and link context menus continue to behave normally.

## Subnetting article expansion

The Foundation track contains 20 original articles; the IPv4 track contains 20 original articles. Detailed subnetting includes worked /20, /22, /25, /26, /27, /28, /29, /30 and /31 plus /32 considerations, VLSM and network arithmetic. Educational interactive mini topologies remain read-only.

## Source layout

- packetlab-v11-book-expanded.js: additional reference articles; inserted before the Net@Lab reader initializes.
- packetlab-v11-training.js: chapter catalog, training preview, four difficulties and objective-aware book.
- packetlab-v11-quickedit.js: compact gesture overlay with movement/dwell/commit thresholds.
- packetlab-v11.css: stable four-slot mobile navigation and new academy UI.
- packetlab-v09-training.js: compatibility edits for mode switching and top book actions.
- app.js: canvas touch integration to disable legacy CANVAS UI and avoid unwanted pans.
- smoke_v11.cjs: mobile end-to-end regression tests.

## Security and simulation

Exercises do not execute shell commands outside the virtual model. The existing .pklab and .worklab formats remain the stored workspaces. Each training is stored as its own in-app training entry after starting.
