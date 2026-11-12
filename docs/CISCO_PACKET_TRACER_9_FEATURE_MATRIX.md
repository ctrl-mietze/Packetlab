# PaketLab 0.7 vs. Cisco Packet Tracer 9

Cisco Packet Tracer bietet eine große didaktische Netzwerk-Engine mit Echtzeit-, Simulations- und physischen Arbeitsräumen. PaketLab ist bewusst eine **eigenständige, lokal simulierte Android-Anwendung**. Sie darf nicht als vollständiger Cisco-Emulator dargestellt werden.

Quellen zum Funktionsabgleich:

- Cisco/NetAcad: [Introduction](https://tutorials.ptnetacad.net/help/default/intro.htm)
- Cisco/NetAcad: [Simulation Mode](https://tutorials.ptnetacad.net/help/default/mode_simulation.htm)
- Cisco/NetAcad: [Physical Workspace](https://tutorials.ptnetacad.net/help/default/workspaceBasics.htm)
- Cisco/NetAcad: [What's New in 9.0](https://tutorials.ptnetacad.net/help/default/whatsNew.htm)

| Bereich | Cisco Packet Tracer 9 | PaketLab 0.7 | Stand |
|---|---|---|---|
| Logischer Netzplan | Ja | Ja: 18 Vorlagen, freier Bau, Undo/Redo, kabelbasierte Links | Modelliert |
| Touch-Editor | Desktop-fokussiert | Smartphone-spezifisches Touch-Layout, Scroll/Pan ohne versehentliches Dragging | Eigenes Feature |
| Physischer Arbeitsraum | Städte, Gebäude, Räume, Schaltschränke | Einfacher 2D-Gebäudeplan und virtuelle Kabelentfernungen | Teilmodell |
| Geräte-Hardware | Modulare Router/Switches/Clients | Gerätespezifischer Modul-Manager mit Netzwerkadapterzuständen | Teilmodell |
| IPv4, Subnetting | Ja | CIDR-Maskenprüfung, Gateways und IP-Routenmodell | Teilmodell |
| IPv6 | Ja | IPv6-Adressprofile im Gerätetool und Lernmodus | Teilmodell |
| OSPF, EIGRP, BGP, RIP | Ja | Keine vollständigen dynamischen Routingprotokolle | Offen |
| VLAN, 802.1Q, STP | Ja | VLAN-Konfiguration und modellierte Segmentprüfung; kein vollständiges STP/VTP | Teilmodell |
| Switch-/Router-CLI | Cisco IOS Simulation | Virtuelle Cisco-IOS-Kommandos und andere OS-Aliasse | Teilmodell |
| DNS, DHCP, HTTP, FTP, Mail | Umfangreich | Virtuelle Dienstprofile und vereinfachte Resolver/DHCP-Modelle | Teilmodell |
| Firewall / ACL | Ja | Host-/Routed-Firewall, CIDR, Portbereiche, Regeln, Rate/Burst und Logs | Modelliert |
| Simple PDU | Ja | Mehrfach sendbare virtuelle Datenpakete, auswählbare Protokolle | Modelliert |
| Simulationsmodus mit OSI-/Event-Details | Ja, detaillierte PDU-Inspektion/Step-Through | OSI-Erklärung, Hop-Trace und Event Explorer; kein exaktes Frame-Decoding | Teilmodell |
| Echtzeitverkehr | Realistische vereinfachte Geräteprotokolle | Optionale harmlose Heartbeats, ARP/DHCP-Modelle; keine autonomen Angriffe | Teilmodell |
| Industrie-/OT-Geräte | In 9.0 erheblich erweitert | Grundlegende SPS-/IoT-Geräte und Industrie-Preset | Teilmodell |
| Sicherheitslabore | Netzwerksecurity-Simulation | Bewusst aktivierte, ausschließlich lokale Testfälle | Eigenes Feature |
| Multiuser | Peer-/Multiuser-Modus | Nicht implementiert | Offen |
| Speicherung/Tests | PKT/PKZ/Activity Wizard | .pklab v3, Entwürfe, bewertbare Aufgaben | Teilmodell |

**Nächste technische Schwerpunkte:** echte Zustandssimulation von DHCP DORA/ARP und Routingtabellen statt einer reinen Pfadprüfung, OSI-Ereignisse pro Hop, VLAN-Trunking, STP und OSPF/RIP, korrektes NAT/PAT, modularer Gerätekatalog, physischer Schrank-/Gebäudeeditor, Zugriffstests und mobile Interaktionstests.
