# Poni

Aplikasi notch untuk macOS dengan platform plugin terbuka: musik, timer fokus, kalender, cuaca,
jadwal sholat, Shelf untuk menaruh file sementara, dan galeri plugin.

Repo ini hanya berisi build rilis, feed update (Sparkle) dan registry plugin galeri.

## Unduh

Ambil `Poni-<versi>.dmg` dari [rilis terbaru](../../releases/latest). Butuh macOS 14 Sonoma atau yang
lebih baru. Setelah terpasang, Poni memperbarui dirinya sendiri.

Versi beta belum dinotarisasi Apple. Untuk membukanya pertama kali, ikuti [INSTALL.md](INSTALL.md).

## Isi repo

- **Releases**: DMG dan `appcast.xml` per versi.
- **`registry/`**: daftar plugin galeri (`index.json`, ditandatangani Ed25519) beserta berkas
  plugin. Dibaca aplikasi lewat raw.githubusercontent.com.
