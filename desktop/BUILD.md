# Building Omni for Windows

This folder is the desktop shell for the existing site. It does not replace
<https://firechirs-byte.github.io/omni/>. Version **4.3.0** is `APP_VERSION` in
`app.js` and `CACHE` in `sw.js`.

The shell is Electron. The page is the same files as the website, loaded from
`omni://app` with Node kept out of the page. See the top of `desktop/main.js`.

## What you get

On Windows, `npm run pack:win` writes:

- `dist/Omni-4.3.0-setup.exe` — NSIS installer (choose the install folder, desktop and Start menu shortcuts)
- `dist/Omni-4.3.0-portable.exe` — one-file portable executable

`npm run pack:win:zip` writes a zip of the unpacked program (`Omni.exe` plus the DLLs and resources beside it). Unzip it and run `Omni.exe`. That target does not need Wine.

The executables are unsigned. SmartScreen will warn. Do not publish a GitHub Release as part of this packaging step.

Copy the result onto the Windows PC yourself (the intended folder is `E:\Documents\App creation\omni`). Building does not read or write that PC.

## Commands

On the repo root, with Node.js 22 or newer:

```bash
npm ci
npm test
npm run smoke
npm run pack:win
```

`npm test` checks the address and permission rules and does not launch Electron.

`npm start` opens the desktop window on the machine you are sitting at.

`pack:win` runs `electron-builder --win nsis portable --x64`. It needs network access the first time to download Electron's Windows binary. The icon source is `icons/icon-512.png`. Code signing is left unset (`CSC_IDENTITY_AUTO_DISCOVERY=false` avoids a certificate search). No updater is included.

To build on Windows itself, run `npm ci`, `npm test`, and `npm run pack:win` in the project folder. Wine is not used there. The installer and portable exe land in `dist\`.

## Limits found while packaging

These are facts for the 4.3.0 packaging run, not a Windows QA pass:

- This packaging environment is Linux, so it cannot click through the app on Windows, accept SmartScreen, or confirm the share picker, microphone prompt, or installer UI.
- `npm run pack:win` did not finish here. electron-builder creates the NSIS installer, then runs that 32-bit stub under Wine to pull out the uninstaller. Wine 9 on this machine stopped with: `wine: failed to load L"\\??\\C:\\windows\\syswow64\\ntdll.dll" error c0000135` and `ShellExecuteEx failed: Internal error.` The 229 KB `dist/Omni-4.3.0-setup.exe` from that attempt is only the stub, not an installer. `wine32:i386` would be about 250 extra packages, so it was not installed. On Windows, `npm run pack:win` does not need Wine.
- `npm run pack:win:zip` is the Linux-producible package: a zip of `dist/win-unpacked` (`Omni.exe` and the files next to it).
- `npm test` is the unit check for navigation and media rules.
- `npm run smoke` launches Electron against the local files when this environment can open a window. It checks that the page origin is `omni://app`, that `require` and `process` are absent in the page, and that an `https` pop-up is handed outward while a `file:` pop-up is not. It does not sign in to Firebase and it is not a Windows run.
- The 4.3.0 zip from the first packaging run is `dist/Omni-4.3.0-win.zip` (153,761,129 bytes, sha256 `2dea4526f21d29b418003039408c34c6fd85c789a6ee531ea0f7d9fdead1db71`).
- v4.3.1 is the lounge-leave and quieter-sound patch. Its zip is `dist/Omni-4.3.1-win.zip` (153,762,484 bytes, sha256 `b334c1bd053d52a80b218ea8dbcd8d38028251801c26fe79c29544264481bc13`). Unzip it and run `Omni.exe`. It is not the NSIS installer and not the one-file portable exe.
- v4.3.2 keeps the program file named `Omni.exe` (no version in the name) and the same `%APPDATA%\Omni` profile. Its zip is `dist/Omni-4.3.2-win.zip` (153,765,357 bytes, sha256 `653a56588861ead3208d873ceb8f5d01f0f2357002cd72b66766484ec5803d0a`). Automatic updates are not switched on.
- v4.3.3 shows Join Call until the microphone connects, and Leave hides the participant grid again. Its zip is `dist/Omni-4.3.3-win.zip` (153,766,177 bytes, sha256 `8b028d2cef242ff4bd89310060835ced2cc3bc7659a20f92af215924f7eac614`).
- v4.3.4 adds the desktop Lobby and self-reported Minecraft and Roblox names. Its zip is `dist/Omni-4.3.4-win.zip` (153,770,123 bytes, sha256 `8fac57e9eab2e7633510def3e8e2c645df33dd8512a5bcfc0361bdd1637f0ed3`).
- v4.3.5 restyles the lobby and adds `download.html`. Its zip is `dist/Omni-4.3.5-win.zip` (153,771,314 bytes, sha256 `598918cc68cbedd91ab0cf5429914e1e3c191b6be30a5ef77ce7c7b118e09fe9`).
- The Apple Silicon test archive is `dist/Omni-4.3.5-mac-arm64.zip` (117,719,741 bytes, sha256 `5827cc409faa2b90cb09601946f293b317f00a86b2181e65e821949a6329457e`). It contains `Omni.app`, not a Windows exe. It is unsigned. No Mac launch was done here. Do not build a DMG on Linux.
- v4.3.6 is the same Apple Silicon test app with the create-account dialog drawn above the login screen. Its zip is `dist/Omni-4.3.6-mac-arm64.zip` (117,720,108 bytes, sha256 `0dd4f11131f4c0be2dfc6fe770431498244447ff3271e7720abe76ee12d06fd8`). Product name stays Omni and the app id stays `io.github.firechirs-byte.omni`. electron-builder on Linux skipped macOS code signing (`supported only on macOS`). That zip is not a valid Mac development signature. No Mac launch was done here.

## Behaviour notes

- Internet is required for Firebase email/password sign-in and live chat. The project stays `omni-chat-kb26` (Firestore `asia-southeast1`). No data is migrated or deleted.
- Email/password does not use a browser redirect. If sign-in ever reports `auth/unauthorized-domain` or an API-key restriction, that is a Firebase console website restriction on the key, not a second database. Do not point this app at a different Firebase project to get around it.
- Local-only chats are not imported from the browser. They live under `%APPDATA%\Omni`.
- Meetings stay local to the computer, the same as the website today. Screen share opens Omni's picker (a list of screens and windows). Capture starts only after a choice. The system share sheet is not used: in Electron 45 it exists for macOS, not Windows.
- The service worker is a website feature. The desktop package does not serve `sw.js` and does not register it.
