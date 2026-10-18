# Moon-Runner

**Quantum-Lock Delivery Service.** Fast parcels, no friction, one Moon.

A comic-book 3D delivery game on the Moon. You're a courier on frictionless **Quantum-Lock Skates**: dive into
craters, launch off rims and chain momentum while pirates try to steal your cargo and military bases guard their
airspace.

The Moon is a real sphere (about 22.6 km round) you can ski all the way around. Settlements are on the sunlit side;
the **dark side** is pitch black, lit only by your helmet lamp, and full of pirate dens.

## Download

Get the latest build from the **Releases** page:

- **Windows:** `…-windows-portable.exe` (SmartScreen may warn: *More info → Run anyway*) or the `win-x64.zip`.
- **Linux:** `…-linux-x86_64.AppImage`, then `chmod +x` and run. For the PlayStation gyro, the pad's `/dev/hidraw*`
  must be readable (Steam's `steam-devices` udev rules, or
  `KERNEL=="hidraw*", ATTRS{idVendor}=="054c", MODE="0660", TAG+="uaccess"` in `/etc/udev/rules.d/`).
- **macOS:** `…-mac-universal.zip`, then right-click → Open. If it says "damaged", run `xattr -cr Moon-Runner.app`.

`F11` toggles fullscreen. Changes per version are in [CHANGELOG.md](CHANGELOG.md). Building, controls, features
and the source map are in [docs/reference.md](docs/reference.md).
