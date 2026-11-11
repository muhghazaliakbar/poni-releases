# Memasang Poni (beta)

[English](INSTALL.md) · **Bahasa Indonesia**

Poni butuh **macOS 14 Sonoma atau yang lebih baru**. Notch paling pas di MacBook yang memiliki notch.
Di layar tanpa notch, Poni menampilkan notch virtual di tengah menu bar.

## Kenapa macOS menahan Poni?

Rilis beta ditandatangani dengan sertifikat sendiri (bernama "NotchKit Beta Signing", nama lama Poni), bukan sertifikat Developer ID dari Apple,
dan belum dinotarisasi. Karena itu Gatekeeper menahan aplikasi saat **pertama** kali dibuka. Ini bukan
tanda aplikasinya rusak. Konfirmasi ini hanya sekali: update lewat menu **Periksa Pembaruan** terpasang
tanpa langkah ini lagi, dan izin yang sudah Anda berikan (Kalender, Notifikasi, dll.) tetap tersimpan.

## Langkah

1. Buka `Poni-<versi>.dmg`, lalu seret **Poni** ke **Applications**.
2. Buka Poni dari folder Applications. macOS menampilkan *"Poni" Not Opened*. Klik **Done**.

### macOS 15 Sequoia dan yang lebih baru

3. Buka **System Settings → Privacy & Security**.
4. Gulir ke bagian **Security**. Akan muncul *"Poni" was blocked to protect your Mac*.
   Klik **Open Anyway**, lalu masukkan password Mac Anda.
5. Klik **Open Anyway** sekali lagi pada dialog yang muncul. Poni akan terbuka dan menampilkan onboarding.

Tombol **Open Anyway** hanya muncul sekitar satu jam setelah percobaan membuka di langkah 2. Kalau tidak
terlihat, ulangi langkah 2.

### macOS 14 Sonoma

3. Di Finder, klik kanan (atau Control-klik) **Poni** di Applications, pilih **Open**, lalu klik
   **Open** di dialog.

### Alternatif: Terminal (semua versi)

```bash
xattr -dr com.apple.quarantine /Applications/Poni.app
```

Perintah ini menghapus tanda "diunduh dari internet" pada aplikasi, sehingga Poni langsung bisa dibuka.

## Memverifikasi unduhan (opsional)

Pastikan aplikasi ditandatangani oleh sertifikat "NotchKit Beta Signing" yang sama dengan yang diumumkan di halaman
rilis:

```bash
codesign -dv --verbose=2 /Applications/Poni.app 2>&1 | grep Authority
codesign -d -r- /Applications/Poni.app
```

Baris `designated => … certificate leaf = H"…"` harus sama dengan sidik jari di halaman rilis.

## Menghapus

Keluar dari Poni lewat ikon menu bar, lalu hapus `Poni.app` dari Applications. Data opsional:
`~/Library/Application Support/Poni` (plugin dan Shelf), dan preferensi `app.useponi.poni`.
