# Omni

Omni is a chat + meeting app with **four modes**:

| Mode | Look | What it's for |
|------|------|---------------|
| **Gaming** | charcoal + lime, cut corners, mono labels, scanlines | squads, party finder, voice-first lounge, clips |
| **School** | warm paper, ruled lines, hand-drawn corners, marker highlights | classes as servers, #homework, assignments, hand-raise, breakout groups, student/teacher/parent roles |
| **Work** | stencil headings, hazard stripe, square and sturdy | #site-updates, #schedule, #safety, tasks & shifts, file sharing |
| **Casual** | soft green, dots, bubbles, rounded | chats and group chats in bubbles, like WeChat or Viber |

You can restyle **everything** from the **Customize** panel (the palette icon), and each mode keeps its own messages and its own look.

It's plain **HTML + CSS + JavaScript**. No frameworks, no build step, no installs.

---

## 1. Open it on your computer

**Quickest:** double-click `index.html`. Almost everything works, but the *install as an app* and *offline* features need a web server (see below).

**Better (local server):** open a terminal in this folder and run:

```bash
python -m http.server 8000      # on Mac/Linux you might need: python3 -m http.server 8000
```

Then go to **http://localhost:8000** in Chrome or Edge. Press `Ctrl+C` in the terminal to stop it.

> If you use VS Code, the "Live Server" extension does the same thing with one click.

## 2. Put it online for free

Pick one:

**GitHub Pages**
1. Make a free account at github.com and create a new repository (e.g. `omni`).
2. Click **Add file → Upload files** and drag in everything from this folder (not the zip itself).
3. Go to **Settings → Pages**, set *Source* to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute your site is at `https://YOUR-NAME.github.io/omni/`.

**Netlify Drop**
1. Go to **app.netlify.com/drop** (free account).
2. Drag this whole folder onto the page. You get a link straight away.

Both give you `https://`, which is what lets people install Omni as an app.

Ask a parent before you publish anything, and never put passwords or private info in the code.

## 3. Install it like a real app

Open the online (https) version, or the localhost one, then:

- **Chrome / Edge on a computer:** click the install icon ⊕ in the address bar, or the **⇩** button in Omni's top bar.
- **Android:** Chrome menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone / iPad:** Safari → Share ⬆ → **Add to Home Screen**.

It gets its own icon and window and opens even when you're offline. That's the service worker (`sw.js`) doing its job.

A zipped copy of the whole site is in `omni.zip` if you want to send it to someone or back it up.

---

## 4. Tour of the code (where things live)

```
index.html            the page layout (what's on screen)
styles.css            how it looks: 15 numbered sections, mode personalities near the bottom
config.js             online settings (Supabase URL + publishable key, GIF key, AI address)
app.js                how it works: modes, themes, rendering, settings, customize, updates
icons.js              Omni's own hand-drawn SVG icons (icon('send') gives you one)
media.js              profile pictures (crop), background pictures, colour matching
extras.js             message menu (edit/delete/forward/copy/react), emoji picker, GIF panel + GIF search
safety.js             the Settings → Safety screens for the family filter
browser.js            the mini browser side panel
supabase.js           going online: accounts, online chats, DMs, live messages, pictures
assistant.js          the "Ask Omni" helper panel
sounds.js             all the sound effects (made in code, no sound files)
filter-words.js       the family filter's default word list (kept out of sight on purpose)
filter.js             the family filter: finds rude words, PIN hashing
emoji.js              the emoji list for the picker (plain Unicode emoji)
fonts/                6 open-licence fonts (woff2) + their OFL licence files + fonts.css
gifs/                 Omni's own animated GIFs (drawn with code, not copied)
supabase/schema.sql   the online database: tables + privacy rules (paste into Supabase)
supabase/functions/ask-omni/index.ts   the Ask Omni server function (keeps the AI key secret)
sw.js                 service worker: saves files so the app works offline + handles updates
manifest.webmanifest  app name + icons, for installing
icon.svg, icons/      the app icons
```

### Modes → `app.js`, section **1. MODES**
Each mode is one block of settings inside the `MODES` object:
- `servers`: the round buttons on the far left (classes in School, sites in Work…)
- `channels`: default channels, each with an icon and a topic
- `labels`: the words used on screen (e.g. "Party" vs "Class" vs "Crew")
- `roles`: Student / Teacher / Parent, Player / Squad leader, and so on
- `extra`: the mode's special panel (Party finder, Assignments, Tasks & shifts, Reminders)
- `emphasize`: buttons that get highlighted (School highlights Raise hand)
- `icon`: names from `icons.js` (no emoji icons any more)
- `theme`: the mode's default colours, font, roundness and which panels show

**Try it:** change `accent: '#c6f432'` in the gaming block to `'#ff0000'`, save, and refresh. Gaming mode is now red.
**Challenge:** copy a whole mode block, rename it (e.g. `sports`), and a 5th mode button appears automatically.

### Themes → CSS variables
At the top of `styles.css`, `:root { ... }` has variables like `--accent`, `--bg`, `--panel`, `--text`, `--r` (corner roundness), `--fs` (font size), `--ls` (letter spacing), `--lh` (line height), `--msg-w`, `--side-w`, `--grain`, `--bg-dim` and `--bg-blur`. Every rule below uses them, for example `background: var(--accent)`.
The `applyTheme()` function in `app.js` (section **4**) changes those variables, and the whole app restyles itself instantly. The Customize panel just edits the theme and calls `applyTheme()` again.
Each mode's personality (gaming cut corners, school ruled paper, the work hazard stripe, casual dots) is near the bottom of `styles.css`.

### Saving → `localStorage`
Everything is saved in your browser (section **3. Storage**):
- `omni_v3`: settings (current mode, your name, your custom themes)
- `omni_v3_data_gaming` (and `_school`, `_work`, `_casual`): each mode's messages, channels, tasks and files
- `omni_v3_board_<mode>`: the whiteboard drawing
- `omni_v4_avatar`: your profile picture (a small 256 × 256 picture saved as text, a "data URL")
- `omni_v3_bg_<mode>`: that mode's background picture (shrunk to fit)
- `omni_v4_auth`: your online sign-in (only when you use Omni online)

Messages from the old version (`omni_v2`) are copied in automatically the first time.
To peek at the saved data: press `F12` → **Application** → **Local Storage**.

### Updating after you change code
The service worker serves the saved copy of each file, so the app opens instantly and works offline. That also means **your code changes won't show up on a normal refresh** when you use http://localhost or a hosted site. You have two options:
- **While coding:** press `Ctrl+Shift+R` (hard refresh), or in DevTools (`F12`) go to **Application → Service workers** and tick **Update on reload**.
- **Releasing a new version:** bump `APP_VERSION` in `app.js` (e.g. `4.0.0` → `4.1.0`) **and** `CACHE` in `sw.js` (e.g. `omni-v4.0.0` → `omni-v4.1.0`). Always change both together, and if you add a new file, add it to the `FILES` list in `sw.js` too. Everyone who has Omni open gets an **"A new version of Omni is ready"** banner with a sound. Pressing **Update now** reloads into the new version, which plays a fanfare and says "Updated to v4.1.0". You can also press **Settings → Check for updates**.

(Double-clicking `index.html` doesn't use the service worker, so there your changes always show straight away.)

---

## 5. Sounds

All of Omni's sounds are **made in code** in `sounds.js` with the Web Audio API. There are no sound files, so nothing is copied from anyone. Each sound is a few notes played on a tiny synthesizer.

**Each mode has its own instrument:** Gaming = punchy synth, School = soft chime, Work = clean beep, Casual = bubbly pop.

| Sound | When it plays |
|-------|---------------|
| send | you send a message in a channel |
| dm | you send a direct message |
| mention | your message @mentions someone (e.g. `@Sam`) |
| receive | someone else's message arrives in an online chat |
| toast | the small pop-up message in the corner |
| join / leave | mic/camera connects, you leave the meeting, or you join/leave a breakout room |
| hand | you raise your hand |
| reaction | you send a reaction |
| updateAvailable | the "new version ready" banner appears |
| updated | the app reloads into a new version |
| installed | Omni is saved for offline use for the first time, or installed as an app |

**Settings:** Customize → **Sounds** (also **Settings → Sound & updates**). There you'll find: sound on/off, volume, sound style ("Match the mode" or pick one), on/off switches for *Messages & notifications*, *Calls, hands & reactions*, and *Updates & install*, plus a **Test** button for each. Sound settings are shared by all modes and saved in `omni_v3_sound`.

**Why no sound until I click?** Browsers block pages from making noise until you click or press a key (the "autoplay rule"). Omni switches its audio on at your first click. If an update sound happened before that, it plays on your first click instead.

**Make your own sound:** in `sounds.js`, add a line to `TUNES`, e.g. `levelUp: [[0, 0, .08], [7, .08, .08], [12, .16, .2]]` (each note is *[semitones, start time, length]*), add it to `CATEGORY`, then call `Sounds.play('levelUp')` anywhere in `app.js`.

## 6. Messages, emoji and GIFs

- **Message menu:** right-click a message (or press and hold on a phone/tablet). You get quick reactions, **Edit**, **Forward**, **Copy text** and **Delete**. You can only edit or delete *your own* messages. Edited messages say *(edited)*. Deleted messages disappear completely (no "message deleted" note). Forward lets you pick another channel or chat in the same mode, and the copy is labelled *Forwarded*. Press `Esc` or click somewhere else to close the menu.
- **Emoji:** the smiley button next to the message box. It has categories, search and a *recently used* tab. The emoji goes wherever your cursor is.
- **GIFs:** the **GIF** button. *Omni GIFs* are 8 animated GIFs in `gifs/` that we made ourselves with Python, so they work offline. *From a link* takes an `https://` link ending in `.gif`. *From your computer* saves the GIF inside the browser, so it has a **1.5 MB limit** (the browser only has about 5 MB of space for the whole app). You can add a caption too. *Search* finds GIFs online once a GIF key is in `config.js` (GIPHY with rating **g**, or Tenor with the strictest content filter); without a key it shows Omni's own GIFs.

## 7. Family word filter

Go to **Settings → Safety** (or the shield button) → **Family word filter**. It's **off** until a grown-up sets it up:
1. A parent, guardian, or brother/sister aged 18+ ticks the box, types their name and relationship, and picks a **4–6 digit PIN**.
2. The PIN is stored as a scrambled **SHA-256 hash** (with `crypto.subtle`), never as the PIN itself. 5 wrong tries locks it for 60 seconds.
3. After that, the PIN is needed to turn the filter on or off, change what it does, or edit the words.

**What it does:** either *Replace with \*\*\*\** or *Block sending and show a friendly warning*. It checks messages, edits, forwards, GIF captions, channel/server/contact/display names, theme names, mini-browser searches and Ask Omni questions. Online, it also stars rude words in other people's messages on your screen. Names are always blocked, never starred. It works in all four modes.

**How it matches** (`filter.js`): whole words only, upper or lower case, so *class*, *grass* and *Scunthorpe* are fine. It also spots simple tricks: `@`→a, `$`→s, `0`→o, `1`/`!`→i, repeated letters (*fuuuck*), and letters split up with spaces or dots (*f u c k*, *f.u.c.k*). The adult can add or remove words and add **allowed** exceptions. Words are shown masked (`f•••`) unless they tick *show words*.

**Forgot PIN:** type `RESET` to wipe the filter settings on this device. This is a **device-only** filter until Omni has real accounts and a server. A determined person could reset it or clear the browser data, and Omni can't really check anyone's age (it's an honour system).

## 8. New in v4: pictures, colours, fonts, mini browser

- **Profile picture:** click your avatar (bottom left) or Settings → Profile picture. Drag to move, slider (or `+`/`-`) to zoom, arrow keys to nudge. It's resized to 256 × 256 in the browser. No picture? You get coloured initials.
- **Background picture:** Customize → Background picture. Each mode has its own. **Dim** and **Blur** sliders keep text readable; big photos are shrunk (max 1600 px) so they fit in browser storage.
- **"Match Omni's colours to this picture?"** After you pick a picture, Omni samples it on a canvas, groups the colours with *k-means* (`media.js`, section 4) and builds a theme. It checks **WCAG contrast** (text at least 7:1, button text at least 4.5:1, accent at least 3:1) and adjusts lightness until it passes. *Always* / *Never* can be changed in Customize.
- **Customize:** 17 fonts (6 bundled: Inter, Atkinson Hyperlegible, Space Grotesk, Nunito, Lexend, JetBrains Mono, plus system font stacks), separate heading font, letter spacing, line height, message width, sidebar width, avatar shape (circle / rounded / square / hex), icon style (sketch / clean / bold), paper grain, animations on/off, and **Saved themes**: name your look and reuse it in any mode.
- **Fonts:** in `fonts/`, each with its SIL Open Font License (`OFL-*.txt`). They're cached by `sw.js`, so they work offline.
- **Mini browser** (globe button): type an address or search words. Searches use DuckDuckGo's simple HTML page with safe search on. Many big sites (Google, YouTube, Discord…) refuse to be shown inside other apps. Omni knows the common ones and shows **Open in new tab** instead. If a page stays blank, use the open-in-new-tab button. YouTube video links are turned into the embeddable player. Back / Forward only remember pages you opened from Omni's address bar.
- **Ask Omni** (sparkle button): a homework/coding helper. It only works once the server function is set up (see section 9, step 7).

## 9. Going online with Supabase (step by step, for Keagan and his dad)

Supabase gives Omni a real database, sign-in and live messages. The free plan is plenty. **Do this together.**

**What's already done:** Keagan's project address (`https://fvtecqhhigadclxcamyt.supabase.co`) and key are already in this copy's `config.js`. Omni checks them when it starts, and the chip at the bottom left tells you what's missing.

1. **Check the key.** In Supabase: *Project Settings → API Keys*. Copy the **publishable** key (starts with `sb_publishable_`) for *this* project (or the legacy **anon public** key) and make sure it matches `SUPABASE_ANON_KEY` in `config.js`. If the chip says **"Online key rejected"**, the key is wrong or from another project. **Never** use the `service_role` / `sb_secret_` key in Omni.
2. **Create the database.** *SQL Editor → New query*, paste **all** of `supabase/schema.sql`, press **Run**. It makes the tables, the privacy rules (Row Level Security), the `avatars` and `gifs` picture buckets and live updates. It's safe to run again after updates. Reload Omni: the chip should say **"Online ready · not signed in"**.
3. **Sign-in settings.** *Authentication → Sign In / Providers → Email*: keep it on.
   - **Confirm email** is ON by default: after making an account you must click the link in the email before you can sign in. That's good for kids' accounts.
   - **Important:** Supabase's built-in email sender only emails people who are members of your Supabase *organisation team*, and only about **2 emails per hour**. Anyone else gets *"Email address not authorized"* and can't confirm their account. Fixes, best first:
     1. Set up your own email sender (*Authentication → Emails → SMTP Settings*). Free tiers from providers like Resend or Brevo are enough. Then everyone gets their emails (default limit 30/hour; change it in *Authentication → Rate Limits*).
     2. Just for trying it out as a family: turn **Confirm email** off, so new accounts sign in straight away. (Password-reset emails still won't reach non-team addresses.)
   - *Authentication → URL Configuration*: set **Site URL** to where Omni lives (e.g. `https://your-name.github.io/omni/`) and add it to **Redirect URLs**. While you only use the `index.html` file, links in emails land on the Site URL, and you then sign in with your password in Omni. (Emailed sign-in links need a real web address.)
4. **Make accounts.** In Omni: the chip or *Settings → Online account → Create account…*. Under-18s must give a parent/guardian email (saved as `parent_email`; `is_minor` can only be changed by a parent or in the dashboard).
5. **Chat.** *Settings → Online account*:
   - **New online chat** creates a group chat with an **invite code**. It appears under the globe server in the left rail. Give the code to friends in real life; they press **Join with code**.
   - **Message a friend** starts a direct message using your friend's **friend code** (each person's is in their Settings). Nobody can search for you, so only people you give your code to can DM you.
   - Messages, edits and deletes appear live for everyone in the chat. Your profile picture is uploaded to the `avatars` bucket so friends see it.
   - Your local servers, local DMs and notes stay on your device, just like before.
6. **GIF search.** Keagan's GIPHY key is already in this copy's `config.js` (`GIF_API_KEY`, `GIF_PROVIDER: 'giphy'`). The GIF button's **Search** tab shows **trending** GIFs, and typing searches GIPHY. Only GIFs rated **G** are asked for, search words go through the family filter, and "Powered by GIPHY" is shown as GIPHY's terms require. (A GIPHY key is meant to be used in apps like this, but anyone can see it, so if it's ever misused, make a new one at developers.giphy.com.)
7. **Ask Omni (optional, needs a paid AI key).** The AI key must never go in the app. Install the Supabase CLI, then in this folder:
   ```bash
   supabase login
   supabase link --project-ref fvtecqhhigadclxcamyt
   supabase secrets set OPENAI_API_KEY=sk-...        # stays on Supabase's servers
   supabase functions deploy ask-omni
   ```
   Put `https://fvtecqhhigadclxcamyt.supabase.co/functions/v1/ask-omni` in `config.js` as `AI_ENDPOINT`. Only signed-in users can use it. It has a kid-safe system prompt, a moderation check, and sends worrying questions straight to a "talk to a trusted adult" answer.
8. **Put Omni on https** (section 2) when you're ready for friends to use it. That's needed for installing, offline use and email links. Ask a parent first.

**If something goes wrong:** the chip says *Online database not set up* (do step 2), *Online key rejected* (step 1), or *Offline* (no internet: Omni keeps working locally).

## 10. What's real and what's not (yet)

Omni is honest: **no bots, no fake users**.
- **Local mode** (no Supabase): messages, DMs, files and the whiteboard are saved **only on this device**.
- **Online mode:** online group chats and online DMs really go between accounts, live. Reactions and forwards are still saved on your device only.
- Mic, camera and screen share really work, but only you can see them. Real calls need WebRTC + a signalling server.
- The file list stores the file's **name and size**, not the file itself.
- The family word filter runs on each device (see section 7). The database rules protect privacy (who can read what), but they don't filter words.
- The other Safety tools (parent link approval, block, report) are **placeholders marked "Coming soon"**.

## 11. Renaming the app

The name is in **one place**: `const APP_NAME = 'Omni';` at the top of `config.js`. Change it (e.g. `'Kin'`) and the page title, welcome screen, buttons, pop-ups and messages all use the new name (`named()` and `applyAppName()` in `app.js` do the swap). For the installed app's name, also change `"name"` and `"short_name"` in `manifest.webmanifest`. Saved data keeps working because the storage keys (`omni_v3…`) don't change.

## 12. Ideas for what to build next
1. **Parent approval:** an Edge Function that emails `parent_email` an approve link and sets `parent_approved_at`; until then, minors could be limited to group chats.
2. **Block and report** in online chats (a `reports` table plus an RLS rule so only admins can read it).
3. **Real calls** with WebRTC (start with two people). Supabase Realtime can carry the signalling messages.
4. **Online reactions** (a `reactions` table, the same pattern as `messages`).
