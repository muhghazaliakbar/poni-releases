# Poni

A notch app for macOS with an open plugin platform: music, a focus timer, calendar, weather, prayer
times, a Shelf for parking files, and a plugin gallery.

**English** · [Bahasa Indonesia](#bahasa-indonesia)

This repository only holds release builds, the update feed (Sparkle) and the gallery's plugin registry.

## Download

Get `Poni-<version>.dmg` from the [latest release](../../releases/latest). Needs macOS 14 Sonoma or
later. Once installed, Poni keeps itself up to date.

The beta isn't notarized by Apple yet. To open it the first time, follow [INSTALL.md](INSTALL.md).

## What's here

- **Releases**: the DMG and `appcast.xml` for each version.
- **`registry/`**: the gallery's plugin list (`index.json`, signed with Ed25519) and the plugin files.
  The app reads it from raw.githubusercontent.com.

## Bahasa Indonesia

Aplikasi notch untuk macOS dengan platform plugin terbuka. Unduh `Poni-<versi>.dmg` dari
[rilis terbaru](../../releases/latest) (butuh macOS 14 Sonoma atau lebih baru), lalu ikuti
[panduan memasang](INSTALL.id.md) untuk membukanya pertama kali. Bahasa aplikasi bisa diganti di
Pengaturan → Umum → Bahasa.
