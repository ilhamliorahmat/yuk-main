# Contributing to Yuk Main / Panduan Kontribusi Yuk Main

[English](#english) · [Bahasa Indonesia](#bahasa-indonesia)

---

## English

Thank you for your interest in contributing to **Yuk Main**! You are welcome to fork this repository, customize it for non-commercial play, report bugs, add Indonesian location packs, or propose new party games via Pull Requests.

### How to Contribute
1. Fork the repository and create a feature branch from `main` (e.g., `feat/new-location-pack` or `fix/vote-timer`).
2. Keep gameplay logic pure and unit-tested under `lib/games/` (`npm test`).
3. Ensure linting and Firestore security rules validation pass (`npm run lint`) and the production build succeeds (`npm run build`).
4. Never commit `.env.local`, API keys, FTP credentials, or service account `.json` files.
5. Open a Pull Request describing your changes clearly.

### Contributor License Grant (Important)
**Yuk Main** is licensed to the public under the **PolyForm Noncommercial License 1.0.0**, while the original owner (**Ilham Liorahmat**) retains exclusive commercial and monetization rights.

By submitting a Pull Request, issue patch, or other contribution to this repository, you confirm and agree that:
1. Your contribution is your original work (or you have the legal right to submit it).
2. You grant **Ilham Liorahmat** (the Project Owner) a **perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright and patent license** to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, redistribute, and **commercially use or monetize** your contribution as part of Yuk Main or any derivative project, under the PolyForm Noncommercial License 1.0.0 or any separate commercial license chosen by the Project Owner.
3. You retain copyright to your individual contribution and may continue using your own contributed code independently.

If you do not agree to this Contributor License Grant, please do not submit Pull Requests to this repository.

---

## Bahasa Indonesia

Terima kasih atas minatmu berkontribusi untuk **Yuk Main**! Kamu bebas melakukan *fork*, membuat versi kustom untuk dimainkan secara non-komersial, melaporkan bug, menambah paket lokasi Indonesia, atau mengusulkan permainan pesta baru melalui Pull Request.

### Cara Berkontribusi
1. Lakukan *fork* repositori ini dan buat *branch* baru dari `main` (misalnya `feat/paket-lokasi-baru` atau `fix/timer-voting`).
2. Pastikan logika permainan tetap teruji dengan unit test di bawah `lib/games/` (`npm test`).
3. Pastikan *linting* dan pemeriksaan aturan keamanan Firestore lulus (`npm run lint`) serta build produksi berhasil (`npm run build`).
4. Jangan pernah meng-commit `.env.local`, kunci API, kredensial FTP, atau file `.json` Service Account.
5. Ajukan Pull Request dengan penjelasan perubahan yang jelas.

### Hibah Lisensi Kontributor (Penting)
**Yuk Main** dirilis ke publik di bawah **PolyForm Noncommercial License 1.0.0**, sementara pemilik asli (**Ilham Liorahmat**) memegang hak eksklusif untuk penggunaan komersial dan monetisasi.

Dengan mengajukan Pull Request, *patch*, atau kontribusi lainnya ke repositori ini, kamu menyatakan dan menyetujui bahwa:
1. Kontribusimu adalah karya aslimu sendiri (atau kamu memiliki hak hukum yang sah untuk mengirimkannya).
2. Kamu memberikan kepada **Ilham Liorahmat** (Pemilik Proyek) **lisensi hak cipta dan paten yang berlaku selamanya, di seluruh dunia, non-eksklusif, tanpa biaya, bebas royalti, dan tidak dapat dicabut** untuk menggandakan, memodifikasi, membuat karya turunan, menampilkan, mendistribusikan ulang, mensublisensikan, serta **menggunakan secara komersial atau memonetisasi** kontribusimu sebagai bagian dari Yuk Main maupun proyek turunannya, baik di bawah PolyForm Noncommercial License 1.0.0 maupun lisensi komersial terpisah yang dipilih Pemilik Proyek.
3. Kamu tetap memegang hak cipta atas kontribusi pribadimu dan bebas menggunakan kode yang kamu tulis sendiri secara terpisah.

Jika kamu tidak menyetujui ketentuan Hibah Lisensi Kontributor ini, mohon untuk tidak mengajukan Pull Request ke repositori ini.
