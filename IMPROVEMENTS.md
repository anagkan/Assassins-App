# Improvements backlog

A UX audit of the player and admin experience, done in October 2026, plus ideas from similar apps. Items have stable IDs (P = player, A = admin) so they can be referenced in issues, commits and future sessions. Tick an item off when it ships.

## Suggested order

1. Quick fixes: [A1](#a1) temp passwords in the URL, [A2](#a2) confirmations, [A3](#a3) default rules not saved, [P7](#p7) empty kill form.
2. [P1](#p1) Victim confirm/dispute. Biggest change to how the game feels; helps players and admins.
3. [P2](#p2) Notifications: an in-app "what changed" banner first, then Web Push.
4. [P5](#p5) share links and [P6](#p6) NetID login.
5. [P12](#p12) scheduled immunities and purge days, with [A6](#a6) editable announcements.

## What similar apps do

| App | How kills are confirmed | Ideas worth borrowing |
|---|---|---|
| [Macalester assassin app](https://devgarden.macalester.edu/projects/2) | Each player has a secret **kill code**. The victim shows it, the killer enters it, and the server approves instantly | No admin bottleneck |
| [Harvard-Westlake app](https://hwchronicle.com/5062/news/students-use-new-app-to-play-campus-wide-assassin-game) | Killer records a video; **victim confirms on their own phone** | "Anyone can check their target at any time" |
| [assassinspartygame](https://assassinspartygame.vercel.app/help) ([source](https://github.com/minhd-vu/assassins)) | Victim gets a notification and can **confirm or deny** | One shareable party code; optional reshuffle after every kill |
| Splashin ([1](https://woottoncommonsense.com/24329/features/splashin-future-of-senior-assassin/), [2](https://huntleyvoice.com/45562/thevoice/splish-splash/)) | Video proof, then admin approval | **Purge days** (open season, immunities off), revive items, immunity on set days only, anonymous organizer |
| [Parabellum](https://itsallwidgets.com/parabellum) | — | Schedules, purges, immunity, revive, privacy controls |
| Paper rulesets ([1](https://www.scribd.com/document/5403233/Rules), [2](https://www.scribd.com/doc/19631955/Assassin-Rules)) | Victim confirms or contests; Game-Master rules on disputes | **One protest per player** before the final rounds |

Every one of them involves the victim. This app doesn't: victims never see a report against them, and every kill waits on an admin.

**Avoid:** Splashin's live location tracking and pay-to-win features caused controversy, and one school's game was cancelled over safety concerns ([1](https://wlhsnow.com/top-stories/2025/05/27/senior-splashin-canceled-for-the-second-year-in-a-row/), [2](https://camasonian.com/20248/community/chs-students-get-ready-for-senior-assassins-2025/)).

---

## Player experience

### High impact

- [x] <a id="p1"></a>**P1. Victims have no say in their own kill.** *Shipped: confirmed kills are auto-approved and shown to admins until marked seen; disputes carry the victim's note.* A victim only finds out once an admin has approved the kill. Add a dashboard prompt: "*X says they got you at Y. Confirm / Dispute.*"
  - A confirmed kill can be auto-approved, or flagged green in the kill queue.
  - A disputed kill goes to the admin with both sides' accounts.
  - Cuts most of the admin's daily load and most arguments. Needs a new report state (e.g. `confirmed` / `disputed`) and a victim-response column on `kill_reports`.

- [ ] <a id="p2"></a>**P2. Nothing tells players when things change.** Pages only update on reload, and there's no email or push. Players miss:
  - a new target (inheritance, reshuffle)
  - a kill approved or rejected
  - being killed
  - a new immunity
  - an approaching inactivity deadline

  Web Push needs no email service and works on iOS once the site is added to the home screen. Minimal first step: an in-app "Since your last visit: new target, 1 kill approved" banner.

- [ ] <a id="p3"></a>**P3. Eliminated players hit a dead end.** "You've been eliminated" doesn't say who got you, when, or show any stats. The reports list only shows reports *your team made*, never ones against you.

- [ ] <a id="p4"></a>**P4. The target card is hard to act on.** Since photos were removed (`febdfc2`), the target is a name plus initials. That may be fine in a club where people know each other. Consider an optional photo, or a short "how to spot me" note that only the player's hunter can see.

### Medium

- [ ] <a id="p5"></a>**P5. Joining takes three codes and a lot of typing.** Registration code, then join code, then team invite code. `/register` already prefills `?code=`, but the join and team forms don't read anything from the URL. Add share links (`/join/ABC123`, `/team/XYZ789`) and a copy/share button next to each code.

- [ ] <a id="p6"></a>**P6. Login is username-only; recovery means asking an admin.** Players forget usernames between semesters. Allow logging in with NetID, which is already unique and stored.

- [ ] <a id="p7"></a>**P7. The kill report form can be empty.** If every alive target member already has a pending report, the "Who did you get?" select has no options but the form still renders (`src/app/page.tsx`, `PlayingPanel`). Hide it and say "All reports are waiting for review."
  - Pending victims are matched by display name (`pendingVictims`), so duplicate names break it. Match on participant ID.

- [ ] <a id="p8"></a>**P8. Kills can't be reported during a pause, even ones from before it.** Allow backdated reports while paused, and cap `occurredAt` between the game start and the pause time.

- [ ] <a id="p9"></a>**P9. No confirmation before destructive player actions.** There is no `confirm()` or client component anywhere, so one tap leaves a team, withdraws from the game, or withdraws a report.

- [ ] <a id="p10"></a>**P10. Mobile navigation is cramped.** Seven header links in a sideways-scrolling strip, and History is hidden on phones. A bottom tab bar (Home / Feed / Standings / Rules / Me) suits phone players better.

- [ ] <a id="p11"></a>**P11. Flash messages live in the URL** (`?ok=…`, `src/lib/flash.ts`). They reappear on refresh, travel with shared links, and stay in history. See [A1](#a1) for the worst case.

### Nice to have

- [ ] <a id="p12"></a>**P12. More game mechanics** (from the research):
  - scheduled **purge days / open season**
  - **scheduled immunities** (e.g. a recurring "Mon–Wed goggles" rule) instead of one-off posts
  - **bounties**: eliminated players get back in by taking out a bounty target
  - **one protest per player**
- [ ] <a id="p13"></a>**P13. Countdowns** to game start, the next immunity change, and a live inactivity timer.
- [ ] <a id="p14"></a>**P14. End-of-game recap**: your kills, survival time, who got you. Hall of Fame could track club records across seasons (most kills, longest survival).

---

## Admin experience

### High impact

- [x] <a id="a1"></a>**A1. Temporary passwords end up in the URL.** *Shipped: the action returns the password and the page shows it once, beside the row.* Reset password and Create account redirect to `/admin/users?ok=Temporary password: abcd-efgh` (`userAdminAction` in `src/app/admin/actions.ts`). It lands in browser history and Caddy's access logs, and is visible to anyone looking at the screen. Show it once on the page instead (short-lived cookie or the action's return value). **Also a security issue.**

- [x] <a id="a2"></a>**A2. No confirmation on irreversible admin actions.** *Shipped: a confirm dialog on each, and Finish/Reshuffle need the game's name typed (checked on the server too).* One click does any of:
  - **Finish game**
  - **Reshuffle** (voids every pending report)
  - **Purge selected**, with every overdue team pre-ticked
  - **Remove team / player**
  - **Delete draft**
  - **Regenerate join code** (breaks a code already shared)

  Add a confirm step; for Finish and Reshuffle, a type-the-game-name check.

- [x] <a id="a3"></a>**A3. Default rules look saved when they aren't.** *Shipped: new games save the templates; older games with empty boxes show a "Template, not published" note.* The settings form fills empty Rules and Safe Zones boxes with `DEFAULT_RULES` / `DEFAULT_SAFE_ZONES` (`src/app/admin/games/[id]/page.tsx`). Until someone clicks Save, players see "The admins haven't posted rules yet." Save the defaults when the game is created, or label them "Template, not published."

- [x] <a id="a4"></a>**A4. The kill queue lacks context.** *Shipped: earlier rejections, report delay, quick-reject reasons and Undo. Bulk approve was dropped: confirmed kills are already auto-approved, and "Mark all seen" clears them.* Would help to show:
  - ~~the victim's response (see [P1](#p1))~~ shipped with P1
  - ~~whether the killer's team has had other reports rejected~~
  - ~~time between kill and report~~
  - ~~quick-reject reasons~~ ("In a safe zone", "Against the rules", "Not enough detail"; the default rules allow kills with no witness, and the server already blocks wrong targets)
  - ~~bulk approve for confirmed kills~~ not needed after P1

  Reversing a kill means going to Teams → Revive. An **Undo** button on recently approved kills would be easier.

- [x] <a id="a5"></a>**A5. Nothing shows what's blocking the start.** *Shipped: a "Ready to start?" checklist that `startGame` shares, so it reports every problem at once. The registration code was left out: it's for account sign-ups, not this game.* `startGame` (`src/lib/game.ts`) fails on the first problem it finds, one at a time. Show a checklist in the Status box instead:
  - ✓ registration code set
  - ✗ 4 players have no team
  - ✗ "Team Foo" is below the minimum size
  - ✓ rules published

### Medium

- [x] <a id="a6"></a>**A6. Announcements can't be edited**, only deleted and reposted. *Shipped: edit and duplicate links, and a Repeat option that posts one copy per ticked weekday up to an end date; a series can be deleted from any day onwards.* Add edit, duplicate, and recurring schedules for daily immunities.
- [x] <a id="a7"></a>**A7. The Teams page won't scale.** *Shipped: search (name, username, NetID, team), a still-in/out filter, a one-table-of-players view, and each player's forms folded behind a link. Filters survive the redirect after an action.* No search or filter, and every member row has its own Move/Remove/Revive form. At 60+ players it's a wall of dropdowns. Add search, an alive/out filter, maybe a single player-table view.
- [ ] <a id="a8"></a>**A8. The audit log is raw JSON** (`{"participantId":12}`) with no game filter. Render sentences ("Anna removed Bob (reason: inactivity)") and filter by game and action.
- [ ] <a id="a9"></a>**A9. No data export.** CSV of players (name, NetID, team, status) and kill history, for club records and officer handover.
- [ ] <a id="a10"></a>**A10. Limited account management.** Can't delete or merge accounts, or edit a NetID or username. Every admin sees every PUID; consider masking.
- [ ] <a id="a11"></a>**A11. Inactivity has no warning stage.** Overdue teams can only be purged. Add an "at risk in the next 24h" list so admins can warn first, plus an optional automatic purge at the deadline.
- [ ] <a id="a12"></a>**A12. Admins who play can see the whole ring.** Show a warning, or add a game setting for "admins are non-playing referees."
- [ ] <a id="a13"></a>**A13. No admin home dashboard.** `/admin` is just a list of games. Lead with the current game: pending kills, overdue teams, live immunities, today's numbers.
