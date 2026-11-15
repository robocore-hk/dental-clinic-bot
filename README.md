# Zeeno Dental for temi

A patient concierge for dental clinics, built for the temi V3 robot and a clinic dashboard. Zeeno sells this to dental offices. The first release covers arrival assistance, appointment requests, approved education, comfort, directions, reception alerts, staff-controlled aftercare, and private feedback.

This is not a practice-management system. It does not complete check-in in an outside booking system, confirm an appointment, diagnose, prescribe, or recommend a treatment for a particular patient.

## Layout

- `android/` temi app (Kotlin, temi SDK 1.138.0, JDK 17 bytecode, Android SDK 34)
- `dashboard/` React + Vite dashboard, in the same Zeeno visual language as the robot
- `server/` Cloudflare Worker + D1. It also serves the dashboard and can use Workers AI only to pick an approved article, never to invent clinical advice
- `tools/` build, deploy, and seed scripts
- `samples/clinical-content.csv` import schema and sample rows
- `releases/` debug-key signed release APK

The shape follows the Gallery 108 temi project: robot pairing, a live temi map with a lockable floor-plan overlay, PIN-protected staff settings, and a Worker that embeds the dashboard. The visual theme, copy, and content are Zeeno’s, for clinics.

## Brand

Colours and type follow [zeenorobotics.com](https://zeenorobotics.com/company/): electric blue `#1F1FFF`, silver `#B3C1C9`, navy `#000F3A`, near-black surfaces, light grey `#F4F7F9`, and green `#61CE70` / `#467C45`. Display type is Space Grotesk. Body type is DM Sans. Chinese text uses Noto Sans SC or Noto Sans TC. The wordmark and favicon are the Zeeno assets.

## Robot rules

- temi V3, 1920×1080 landscape, Android 11 (`targetSdk` 30, `compileSdk` 34)
- Kiosk mode defaults to on: the app asks to be the kiosk app, hides the temi top bar, and stays in front
- Back returns to the previous page inside a journey. Back or the X on the home screen quits. The X on the welcome screen also quits
- Language, Home, and Contact reception stay available after the welcome
- Staff settings and aftercare selection are behind a PIN. The default PIN is `2408`. Change it in the dashboard. The dashboard is the place that sets the PIN
- Personal details are cleared after inactivity (default 90 seconds) and when a journey is finished
- A greeting is spoken once. It is not repeated while the same person is still detected, and not again inside the greeting cooldown after a brief loss of detection

## Languages

English, Spanish, Simplified Chinese (简体), and Traditional Chinese (繁體). Language is the first step after the short welcome, with large buttons, and can be changed later from the header. Patient UI, spoken prompts, and seeded clinical text exist in `en`, `es`, `zh-Hans`, and `zh-Hant`.

Speech uses temi TTS: English (`EN_US`), Spanish (`ES_ES`), Simplified (`ZH_CN`), Traditional (`ZH_TW`).

## Patient journeys

The home screen is six tiles:

1. **I have an appointment** — arrival assistance. The patient enters a booking reference, or a name and time. Reception is notified. The screen never says check-in is complete in a booking system. If nothing matches, reception can take over.
2. **I need an appointment** — requested service, preferred day, and a phone or email. This is a request, not a confirmed appointment.
3. **About my dental visit** — first-visit orientation, treatment explainers, oral-care demonstrations, and a clinic FAQ. Answers come only from approved content. The source, version, and reviewer are shown. If nothing matches, the patient can ask reception. There is no unrestricted clinical chatbot.
4. **Help me feel comfortable** — a discreet “I feel nervous” pause, how to tell the team, a private note to reception, and children’s activities (brushing order, tools, a short story). Quiet mode is on by default for children. Those activities do not ask for a child’s name. Nothing promises a painless visit.
5. **Directions** — approved places from the dashboard (reception, waiting area, consultation entrance, treatment room). The patient can read stationary directions or be escorted. A treatment room waits until a staff member confirms it is ready.
6. **Contact reception** — appointment help, accessibility, feeling unwell, or another question. The screen shows whether the alert was stored in the staff inbox. It says this is not an emergency system.

**Feedback** is a smaller control on the home screen, not a seventh tile. Answers go to the clinic team and are not shown in the waiting room. “Please contact me” is private.

**Aftercare** is staff-only. A staff member (robot PIN, or the dashboard) chooses the procedure and the instruction version. The patient then sees that text and can take a copy by QR. The QR page has no patient name. The patient cannot guess which instruction set applies.

## Clinical boundaries

- No diagnosis, prescription, or patient-specific recommendation
- No public announcement of medical details or full identities
- Approved content plus escalation only. Workers AI, when configured, may only return the id of an approved item. The spoken answer is that item’s text
- Identifiable details leave the robot screen after completion or inactivity
- Chat and statistics store a topic or content id, not the question text and not a patient name
- Treatment areas require an explicit staff confirmation
- A success animation is not used in place of a delivery result. “In the reception inbox” means the Worker stored the row
- Every clinical item has a version and a reviewer

## Pairing

Until a robot is paired it uses the bundled sample clinic in `android/app/src/main/assets/seed.json`. Requests are not delivered in that mode, and the screen says so.

1. In the dashboard, open Robots and create a robot for a clinic. The pairing code is 6 digits and lasts 7 days.
2. On the robot, open the gear, enter the staff PIN, and type the code.
3. Content, destinations, and the PIN then come from that clinic.

The release app talks to `https://zeeno-dental.robocore-hk.workers.dev`. Override that with `-Pzeeno.api=https://…` if you build against another worker.

## Dashboard

- **Zeeno admin** sees every clinic, creates clinic-owner logins, and assigns one or more clinics to an owner. Cross-clinic statistics are on the Statistics page.
- **Clinic owner / staff** edits only assigned clinics.
- Clinic profile, dentists, and clinical libraries (FAQ, explainers, first visit, oral care, aftercare, anxiety, children’s copy) with language variants, version, and reviewer
- Import from a link-shared Google Sheet or CSV. Column names are the header of `samples/clinical-content.csv`. No customer sheet URL is set; save one per clinic when you have it. `python3 tools/sheet_to_seed.py samples/clinical-content.csv` converts that CSV into content JSON
- Inbox for arrivals, appointment requests, reception alerts, room-ready confirmations, and private feedback, each with delivery state
- Staff-controlled aftercare: pick a robot and an approved version. The robot shows it on the next check-in. “Queued” means the command is waiting, not that the patient has read it
- Robots: pairing, clinic assignment, kiosk, PIN, languages, speed, greeting cooldown, idle clear
- Map: live temi map, robot position, add and delete locations, send the robot, upload a floor plan, move / zoom / rotate, Lock, then switch among temi map, half-and-half, and floor plan

## Sample data

`server/seed.json` is a fictional clinic, Northline Dental, at a non-existent address with a 555 phone number. Dentists, destinations, and clinical text are sample content in all four languages. Regenerate the JSON and the CSV together:

```bash
python3 tools/build_seed.py
```

Load it into a deployed worker after you have an admin login:

```bash
ZEENO_API=https://… ZEENO_EMAIL=… ZEENO_PASSWORD=… python3 tools/seed.py
```

## Build the APK

JDK 17 language level (the Gradle build itself can run on a newer JDK). Android SDK 34.

```bash
cd android
# optional: android/local.properties with sdk.dir=...
./gradlew :app:assembleRelease
```

`releases/zeeno-dental-v1.0.0.apk` is that release, signed with the Android debug key. To sign with a release keystore, add `android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) and do not commit it. Without that file, release uses the debug key, same as the reference app.

Override the API at build time:

```bash
./gradlew :app:assembleRelease -Pzeeno.api=https://zeeno-dental.robocore-hk.workers.dev
```

## Dashboard and Worker

Local dashboard (API calls proxy to `http://127.0.0.1:8787` if you run a worker there):

```bash
cd dashboard
npm install
npm run dev
```

Build the Worker bundle (dashboard embedded as `server/src/static.ts`, then `server/dist/index.js`):

```bash
python3 tools/build.py
```

Deploy, only when credentials exist. Nothing in this repo deploys by itself. `deploy.py` refuses to run without both variables. It creates or reuses the D1 database `zeeno-dental`, applies `server/schema.sql`, uploads the Worker `zeeno-dental` with D1 and Workers AI bindings, and enables workers.dev.

```bash
python3 tools/build.py
CF_API_TOKEN=… CF_ACCOUNT_ID=… BOOTSTRAP_ADMIN='admin@example.com:password' python3 server/deploy.py
```

`BOOTSTRAP_ADMIN` creates the first admin only when the users table is empty. Do not commit tokens or that password.

The live worker is `https://zeeno-dental.robocore-hk.workers.dev`. `deploy.py` prints the URL again when you upload a new build.

## Launch scope and Phase 2

This release is the launch set from the clinic brief: welcome and language, arrival assistance, walk-in requests, escort and stationary directions, FAQ, treatment explainers, first-visit orientation, anxiety support, children’s activities, oral-care education, staff-controlled aftercare with QR, reception alerts, and private feedback.

Not in this release:

- Queue and visit-status display
- Medical-history and form handoff
- Consent capture
- Remote receptionist or interpreter video (Contact reception is an inbox alert only)
- Follow-up booking and automated reminders

Those can be added later beside the inbox and content libraries. They are not stubbed as patient-facing buttons.
