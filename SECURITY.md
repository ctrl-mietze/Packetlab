# Security Policy

PaketLab is a deterministic local educational simulator; commands typed in virtual terminals and all modeled packets operate only on in-memory virtual devices.

Never report a bug with private SSH keys, router passwords, personal network inventory or sensitive device data in a public issue.

## Scope

- The app should not open real network sockets to execute virtual packet simulations.
- Simulated exploit effects only update virtual device state, such as virtual compromise, simulated performance loss or deliberately chosen outage.
- Ordinary packets must not power devices off.
- The virtual Internet/WAN feature requires configured virtual topology connections; it never uses the phone's Internet connection to send a modeled attack.
- Imported `.pklab` files require size bounds and sane device/link counts.
- The Android WebView JavaScript bridge must not be expanded to execute arbitrary terminal commands on Android.
- An APK signed with a different key may not update an existing installation; back up local projects before installing a separately signed build.

For non-sensitive issues, use [GitHub Issues](https://github.com/ctrl-mietze/Packetlab/issues). For vulnerabilities, prefer private GitHub vulnerability reporting when enabled, and never disclose passwords, private keys or personal details.

The public source preserves TopoLab attribution; see [NOTICE.md](NOTICE.md).
