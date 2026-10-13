# Running a semester of Assassins

This is a checklist for club officers. You don't need to know how to code. You only need an admin account. If you don't have one, ask last semester's admin to click **Make admin** next to your name under **Admin → Users**.

## 1. Set up the game (about 1 week before)
1. Go to **Admin** and create a game (e.g. "Spring 2027"). Under "Copy rules & settings from", pick last semester's game so you keep its rules.
2. On the game's **Overview**, set:
   - **Solo or Teams.** For teams, set the min and max size. Leave max blank to allow any size.
   - **Inactivity limit (days).** Teams with no kill in this many days can be purged. Leave it blank to turn this off.
   - Whether the feed shows **who** made each kill.
   - **Rules** and **Safe zones**. Players see these on the Rules page.
3. Under **Admin → Registration**, generate (or set) a **registration code**. Players need it to create an account. If no code is set, nobody can create an account.
4. Click **Open registration** on the game. Share the site link, the **registration code** and the game's **join code** in the club group chat.

## 2. Registration
- New players go to the site, click **Create an account**, and enter the registration code. Then everyone (new and returning) enters the game's **join code** on their dashboard to join this semester's game.
- To stop new accounts being created, click **Close account sign-ups** under **Admin → Registration**. **Regenerate** gives a new code if the old one leaked.
- In team games, one person creates the team and shares its **invite code** with their teammates.
- To stop new people joining (say, a day before you start), click **Close sign-ups** in the Status box. Players already in can still create, join and leave teams. **Reopen sign-ups** undoes it.
- Under **Teams & players** you can move people between teams, merge or rename teams, and remove sign-ups.
- Players who never joined a team: click **Auto-fill randomly**. It tops up small teams first, then makes new random teams of the size you choose. In solo games, auto-fill with size 1.

## 3. Start
Click **Start game & assign targets**. This only works once everyone is on a team and all teams meet the size limits. Each player's dashboard now shows their target.

## 4. During the game
- **Kill queue.** Check it daily. When a kill is reported, the victim sees it on their dashboard and can **confirm** or **dispute** it.
  - A confirmed kill is approved automatically. It appears under **Confirmed by the victim** (and counts in the tab badge) until you click **Got it**. If one looks wrong, revive the victim.
  - A disputed kill stays pending and shows the victim's side of the story. Approve or reject it as usual.
  - Reports the victim hasn't answered yet can be approved or rejected too, optionally with a note the player will see. If a report shows ⚠, it's out of date (for example, the victim was already out), and approving it just marks it stale.
- **Announcements.** Post daily immunities ("immune while wearing a hat"), rules of the day, or general news. Give each one a start and end time, and it shows highlighted on everyone's dashboard while it's active.
- **Ring & inactivity.** This page shows the full target loop. **Don't screen-share it.** If you set an inactivity limit, overdue teams appear here. Untick anyone you want to spare, then click **Purge selected**.
- **Pause / Resume.** Use these for breaks and exams. Inactivity clocks freeze while the game is paused, and no kills can be reported.
- **Reshuffle.** Gives every alive team a new random target. Use it to shake things up or after a messy dispute.

### Fixing mistakes
- **Wrong kill approved?** Go to **Teams & players**, find the victim, and click **Revive**. If their whole team had been knocked out, choose which team they should hunt. Reviving even reopens a game that already ended.
- **Someone drops out or breaks the rules?** Click **Remove** next to the player, or **Remove team**. Their hunter automatically inherits their target.
- **Forgotten password?** Go to **Admin → Users → Reset password** and send the player the temporary password privately. They'll be asked to change it.
- Every admin action is recorded in **Admin → Audit log**.

## 5. Ending
The game ends automatically when one team is left. To end it early (e.g. at the end of the semester), use **Finish game** on the Overview and pick a winner, or choose no winner. Past games stay under **History** forever.

## 6. Handing over
Before you graduate, make next year's officers admins (**Admin → Users → Make admin**), and give the person who manages the server the [README](../README.md).
