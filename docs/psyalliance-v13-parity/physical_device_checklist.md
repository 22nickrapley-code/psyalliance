# Physical-phone checks (v13 workspace)

Nothing here could be tested from a cloud machine. Everything in the other sheets that says "phone" was **emulated** (Chromium at 320x700, 390x844, 390x390 with touch and a mobile user agent). Emulation does not reproduce the on-screen keyboard, Safari's collapsing address bar, the safe area at the notch, microphone prompts or real touch scrolling. These checks cover exactly those gaps.

Use the review copy (the sandbox site after the v13 deploy). Everything on it is fictional, so nothing you type or send can reach a real person. Start from a fresh sandbox link. Allow about 30 minutes per phone.

**Phones:** one iPhone (Safari) and one Android (Chrome) at minimum. A small-screen iPhone (SE / mini) is the most valuable second device, because 320 px wide is where the approved layout is tightest.

For each line, write Pass, Fail (what you saw) or N/A. A photo or screen recording of every Fail helps most.

| # | Check | iPhone Safari | Android Chrome |
|---|-------|---------------|----------------|
| 1 | Open the sandbox link. The Hub loads, heading "The Hub", no sideways scrolling, nothing cut off at the right edge. | | |
| 2 | Turn the phone sideways and back. The layout redraws without a gap, a jump to the top, or a stuck keyboard. | | |
| 3 | Menu: open each of the seven sections from the menu. The title in the browser tab changes each time. | | |
| 4 | **Keyboard and composer.** Messages, open a conversation, tap the message box. The box and the Send button stay visible above the keyboard. The conversation does not jump out of view. Type three lines: the box grows, Send stays reachable. | | |
| 5 | Tap outside the box so the keyboard closes. The page returns to full height with no blank band underneath. | | |
| 6 | **Dates.** Cover, "Arrange cover for my clients", choose dates. The phone's own date picker opens; the chosen date shows correctly in the form and in the review step. | | |
| 7 | **Selects.** Open any dropdown (conversation context, state, reason). The phone's picker opens and closing it keeps the choice. | | |
| 8 | **Long overlay.** Cover, step 1 through the review step. Heading and footer buttons stay fixed; only the middle scrolls; the last field and the Continue button are both reachable with the keyboard open. | | |
| 9 | Same on the 20-client draft (Cover, Controls "Load a 20-client draft"): scroll to the 20th client, remove one, duplicate one. | | |
| 10 | **Back button / swipe back** while an overlay is open: it closes the overlay and keeps what you typed (the draft reappears when you reopen). It does not leave the workspace. | | |
| 11 | Escape-equivalent: tap the X on each overlay type (Cover, Referral, Consult, Availability, profile). Each closes. | | |
| 12 | **Voice note.** In a conversation tap the microphone. The phone asks for permission once. Record 5 seconds, play it back, remove it, record again, send. Deny permission once and check the message is plain, not a crash. | | |
| 13 | **Attach a file.** Tap the paperclip, choose a photo or PDF under 20 MB. It shows as a chip with a remove button; sending works; a file over 20 MB is refused in words. | | |
| 14 | Safe area: with the phone upright, the top bar is not hidden under the notch and the bottom composer is not hidden behind the home bar. | | |
| 15 | Scrolling: a long conversation and the Library list scroll smoothly with one finger; no scroll gets "stuck" inside a panel. | | |
| 16 | Tap targets: Accept / Decline / Ask first on a Cover request, and Interested / Decline on a referral. Every button is easy to hit without zooming. | | |
| 17 | Text size: set the phone's text size one step larger. Nothing overlaps or disappears. | | |
| 18 | Close the browser tab completely, then open the same sandbox link again. It resumes your sandbox and the draft you left is still there. | | |
| 19 | Slow connection (Airplane mode on, then off): send a message while offline. It shows "Failed · Retry"; after reconnecting, Retry sends it once. | | |
| 20 | Library: open a resource, tap "Open PDF". It opens in the phone's viewer and Back returns to the workspace. | | |
| 21 | The two demo videos on /tour play inline, Escape / the close button closes them and the page behind scrolls again. | | |
| 22 | Sandbox: leave the sandbox open for 3 minutes. Colleagues' replies arrive after about 90 seconds and show up within the next 30 seconds without a manual reload. | | |
| 23 | Account pages: from the menu open Profile, then Settings, then My documents. Each shows the same sidebar and top bar as the Hub; on a phone, More at the bottom opens the full menu and Escape / tapping outside closes it. | | |
| 24 | Profile on a phone: the four parts (Profile, Credentials, Continuity plan) are small pills with the status dot after the name, nothing cut off; there is no Supervision question on the profile form. | | |
| 25 | Availability: tap the availability card on the Hub, set a pause-until date and switch cover off, save. Reopen it: both are still set. The date field opens the phone's calendar, even straight after typing in another field. | | |
| 26 | Report and Block: open a colleague's profile, tap Report this profile (write two words, send), then tap Block and their name. The profile closes and the colleague no longer appears in Network. | | |
| 27 | Consult: on a question you asked, tap Mark as resolved. It shows Resolved with a quiet note, and the reply box is replaced by that note. Reopen it again. | | |
| 28 | Open a conversation and ask a second person (or a second browser) to reply: it appears within a few seconds without a reload; leave the conversation and it checks about every 30 seconds instead (battery). | | |
| 29 | Messages on a phone: open a conversation and tap the three dots beside a message. The small menu (a heart: mark useful) appears next to that message, not somewhere else on the screen. | | |

## What to send back

The device and OS version for each phone, the table above, and screenshots of any Fail. If check 4 fails on iPhone it is the most likely real finding (iOS Safari reports the keyboard differently from every other browser), so please try it first.

## Where the emulated evidence lives

- `visual_capture_plan.csv`: paired reference/target captures at 320x700, 390x844, 390x390 for each screen family.
- `functional_parity.csv`: MOB-01 (overlays, emulated) and MOB-02 (keyboard, **open** until these checks are done).
