# PacketLab 0.8 — Virtual Operating Systems

This is a **device-state simulator**, not a collection of Linux/Windows/Cisco binaries. No command entered in a simulated terminal is executed on the Android host, no real root privilege is granted, and no network sockets or outside traffic are created.

## Supported OS profiles

| Profile | Typical virtual commands | State affected |
| --- | --- | --- |
| Linux / OpenWrt / RouterOS | `ls`, `pwd`, `cd`, `mkdir`, `touch`, `cat`, `echo ... > file`, `rm`, `cp`, `mv`, `stat`, `systemctl start/stop/status`, `journalctl`, `ps` | Virtual filesystem, service switches, device logs |
| Windows | `dir`, `cd`, `type`, `mkdir`, `copy`, `move`, `del`, `tasklist`, `Get-Service`, `Start-Service`, `Stop-Service`, `ipconfig /all`, `route print`, `tracert` | Per-device Windows files, services, existing network profile |
| Android | `getprop`, `pm list packages`, `pm install /sdcard/...apk` (virtual file only), `settings list/get/put global`, `ip addr`, `su -c id` (Crazy Mode + root flag) | Per-device Android profile, virtual packages, virtual settings |
| iOS | `ifconfig`, `scutil --dns`, `netstat -rn`, `sysctl -a`, `defaults read`, `ls` | Virtual iOS profile and file tree; no jailbreak simulation |
| Cisco IOS Model | `show version`, `show inventory`, `show running-config`, `show interfaces`, `show ip route`, `show vlan brief`, `configure terminal`, `interface`, `ip address`, `copy running-config startup-config` | Simulated interfaces, VLANs, routing state, startup-config snapshot |

The existing PacketLab engine remains responsible for virtual `ping`, address validation, DNS, route checks, firewall decisions and packets. These commands delegate to that engine, rather than fabricating successful routes.

## Virtual filesystem

Every device stores its own `vprofile.virtualOS` JSON inside the existing `.pklab` v3 world format:

- Own working directory, folder paths, file contents, settings, installed virtual package names and execution counter.
- Folder and file edits are bounded. The system does not access Android `/data`, `/sdcard`, Windows drives or any real file system.
- A `copy running-config startup-config` action stores the current **simulated** IOS config in the virtual NVRAM.
- Virtual service toggles update `vprofile.enabledServices`. DNS and DHCP flags update their existing simulation behavior.
- The operating system can be chosen individually for each device from its configuration sheet.
- OS-switching retains individual virtual filesystems per OS family within the device profile. Switching back restores that virtual OS filesystem.

## Explicit limits

This is not full-fledged packet-level Cisco Packet Tracer emulation and does not implement operating-system kernels, executable loading, dynamic package managers, real process scheduling, BGP, STP, or complete Ethernet/TCP frame stacks. Terminal output derives from the model's real configuration and is deliberately labeled as virtual. No artificial APK size target is used.

## User interface architecture

The device action sheet is now rendered by **one self-contained component** (`packetlab-v08-device.js`). It uses its own `v8-*` DOM classes, SVG icons, accessible buttons and consistent 48dp+ interaction areas. Legacy `.pl-options` decorators cannot attach extra icons or boxes to the new sheet. Historical actions remain routed into the original modules.

`packetlab-v08-os.js` owns the OS command interpreter, process/service models, virtual files and the new per-OS terminal. `packetlab-v08.css` owns the stable OLED controls and navigation polish.

Use `node smoke_v08.cjs` for a mobile Chromium UI smoke suite, in addition to the existing `tests_packetlab_core.js` and `tests_packetlab_v06.js` suites.
