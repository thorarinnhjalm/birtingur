# Hýsingar- og rekstrarhandbók (Deployment Runbook)

Þetta skjal lýsir skrefunum til að setja ADA vettvanginn upp í hýsingu (production) á Vercel, Firebase og Upstash.

---

## 1. Firebase Uppsetning

Kerfið notar Firebase fyrir auðkenningu, skjalagagnagrunn (Firestore) og geymslu á auglýsingamyndum (Storage).

1. Stofnaðu nýtt verkefni í [Firebase Console](https://console.firebase.google.com/).
2. **Authentication:**
   - Virkjaðu **Email/Password** og **Google Sign-In**.
   - Undir _Authorized Domains_ skaltu bæta við léninu þínu (t.d. `birtingur-dashboard.vercel.app` eða `app.adplatform.is`).
3. **Cloud Firestore:**
   - Stofnaðu Firestore gagnagrunn í _production mode_.
   - Dreifðu öryggisreglum úr `firebase/firestore.rules` og vísitölum úr `firebase/firestore.indexes.json`.
4. **Cloud Storage:**
   - Virkjaðu Cloud Storage.
   - Dreifðu geymslureglum úr `firebase/storage.rules`.
5. **Þjónustuaðgangur (Service Account):**
   - Farðu í _Project Settings_ -> _Service Accounts_.
   - Smelltu á **Generate New Private Key** til að sækja JSON skrá með lyklum sem bakendinn notar til að tengjast gagnagrunninum.

---

## 2. Upstash Redis Uppsetning

Kerfið notar Redis frá Upstash fyrir tölfræði og hraðvirka birtingu auglýsinga á serving-hliðinni.

1. Stofnaðu aðgang á [Upstash](https://upstash.com/).
2. Stofnaðu nýjan Redis gagnagrunn (Evrópusvæði mælt með).
3. Afritaðu eftirfarandi breytur:
   - `KV_URL` (Redis tengislóðin).
   - `KV_REST_API_URL` (REST tengislóð).
   - `KV_REST_API_TOKEN` (REST les/skriflykill).
   - `KV_REST_API_READ_ONLY_TOKEN` (REST leslykill fyrir serving flæði).

---

## 3. Umhverfisbreytur (Environment Variables)

Stilla þarf eftirfarandi breytur í hýsingarstjórnborðunum:

### A. Vercel: `@ada/api` (Bakendi)

Þessar breytur þurfa að vera stilltar á Vercel verkefninu fyrir bakendann:

| Heiti breytu            | Lýsing                                            | Dæmi / Uppruni                                   |
| :---------------------- | :------------------------------------------------ | :----------------------------------------------- |
| `FIREBASE_PROJECT_ID`   | Auðkenni Firebase verkefnisins                    | `markadssetning-62019`                           |
| `FIREBASE_CLIENT_EMAIL` | Netfang þjónustuaðgangs                           | `firebase-adminsdk-...@...gserviceaccount.com`   |
| `FIREBASE_PRIVATE_KEY`  | Einkalykillinn úr JSON skránni (hafðu gæsalappir) | `"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADAN..."` |
| `KV_URL`                | Redis tengislóð                                   | `rediss://default:...@...upstash.io:6379`        |
| `KV_REST_API_URL`       | Redis REST vefslóð                                | `https://...upstash.io`                          |
| `KV_REST_API_TOKEN`     | Redis REST lykill                                 | `gQAAAAAA...`                                    |
| `ADMIN_EMAILS`          | Kommu-skiptur listi af stjórnendum                | `migg@birtingur.is,migg@markadssetning.is`       |
| `CRON_SECRET`           | Leyndarmál til að verja cron-endpoints            | Búðu til sterkan handahófskenndan streng         |
| `GEMINI_API_KEY`        | Vef- og myndgreiningarlykill Gemini               | Sækja á Google AI Studio                         |
| `TEYA_API_KEY`          | Kreditkortagreiðslulykill Teya                    | Sækja í Teya Developer Portal                    |
| `TEYA_WEBHOOK_SECRET`   | Leyndarmál fyrir Teya tilkynningar                | Sækja í Teya Developer Portal                    |

### B. Vercel: `@ada/dashboard` (Framendi)

Þessar breytur þarf að stilla við byggingu (build) á framendanum:

| Heiti breytu                        | Lýsing                             | Dæmi / Uppruni                              |
| :---------------------------------- | :--------------------------------- | :------------------------------------------ |
| `VITE_API_BASE`                     | Slóðin á virka bakendann þinn      | `https://birtingur-api.vercel.app`          |
| `VITE_ADMIN_EMAILS`                 | Kommu-skiptur listi af stjórnendum | `migg@birtingur.is,migg@markadssetning.is`  |
| `VITE_FIREBASE_API_KEY`             | Veflykill Firebase                 | Sækja í Firebase Project Settings (Web App) |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth Domain               | `markadssetning-62019.firebaseapp.com`      |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase Project ID                | `markadssetning-62019`                      |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase Storage Bucket            | `markadssetning-62019.firebasestorage.app`  |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Sender ID                 | `732844415134`                              |
| `VITE_FIREBASE_APP_ID`              | Firebase App ID                    | `1:732844415134:web:...`                    |

---

## 4. Cron Jobs virkjun

Bakendinn keyrir mikilvægar lotuvinnslur í bakgrunni:

- **Inneignar-accrual (`/api/cron-accrue`):** Dregur sjálfvirkt af veski auglýsenda á 15 mínútna fresti fyrir CPM birtingar.
- **Tölfræðisöfnun (`/api/cron-aggregate`):** Safnar saman tímabundnum birtingum og smellum úr Redis yfir í Firestore á klukkutíma fresti.
- **Mánaðarlegt uppgjör (`/api/cron-payouts`):** Keyrir fyrsta dag hvers mánaðar og býr til pending útgreiðslur fyrir útgefendur.

Þessar keyrslur eru sjálfkrafa stilltar í `vercel.json` og munu virkjast sjálfkrafa þegar verkefninu er dreift á Vercel. Þú þarft að tryggja að `CRON_SECRET` sé samstillt í Vercel Dashboard þar sem Vercel sendir hana sjálfkrafa sem `Authorization: Bearer <secret>` við kvaðningu.
