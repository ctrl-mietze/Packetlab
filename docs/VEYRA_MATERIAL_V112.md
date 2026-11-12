# PacketLab 0.11.2 — Veyra Material Guidelines

This is a visual refinement of an existing Android WebView network simulator. Maintain the original OLED black background and Veyra lavender identity while removing excessive colored cards, borders and decorative effects.

## Design vocabulary

Primary background: #09090b. Shell: #111114. Raised form surfaces: #19181d. Secondary surfaces: #202027. Thin separators: #29272e. Readable text: #f0edf4, secondary text: #b8b4bf, muted captions #9a95a2. Accent: #c69ce8. Selected region: #27212f.

Use colors according to their purpose. Neutral surfaces carry the content, lavender marks selected rows and primary controls. Avoid repeated purple gradients, decorative rings, thick borders around every element and opaque shadow stacks.

## Hierarchy & spacing

Modal title should describe the task, not a marketing slogan. Each list or menu row should be approximately 58–64 CSS pixels high on mobile, with a minimum 48 pixel tap target, primary label at 12.5–14px and optional secondary description at 10.5–12px. Group headings are 10px uppercase and are shown only when they help navigate a long list. Keep icons consistent at 18–21px within a small neutral background.

List sections separate through a single dividers system, not one rounded bordered card per row. Reserve larger cards for a real summary, a teaching diagram or a stateful control cluster.

## Where styles apply

- Topology: 18 choices in 2 sections, **Grundformen** and **Szenarien**, compact rows, neutral icon holders and one active selection state.
- Training: flat chapters and rows, distinct difficulty choices, shortened information hierarchy.
- Device actions: self-contained v8 menu still routes every existing function; only paint, spacing and text hierarchy change.
- Firewall Studio: rules and inspection settings use neutral rows and thin separators, clear form labels, colored status only when meaningful.
- Packet composer: one coherent surface with grouped fields, accessible action button and restrained accent.
- Net@Lab: editorial reading layout retained, unnecessary hero gradient and decorative rings removed, interactive diagrams untouched.
- Bottom navigation: 4 clearly defined tabs, one quiet selected background. No extra training tab.

## Compatibility

This style is implemented in packetlab-v112.css loaded last. Existing JS behavior and the graph engine are preserved. The only changes to the preset builder module are clearer copy, two structural group headings and the release version. The API and project file schema are unchanged.

## Visual QA

Use smoke_v112.cjs (43 mobile scenarios), tests_packetlab_core.js (12) and tests_packetlab_v06.js (18). Validate the Android debug APK separately. Check that list rows do not fall below 48 CSS pixels, the 18 preset options remain tappable, and the training and Net@Lab content stays complete.
