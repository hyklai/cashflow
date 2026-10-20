# Cash Flow Challenge

A classroom game for introductory engineering economics. Each student starts with the same money. Every "year" they choose between bank savings and a few randomly drawn investments shown as cash-flow diagrams. The big screen shows the top 5 in net worth, liquid capital, gain and diversification, and the teacher sets the pace and fires surprise events.

| Page | Who uses it | What it does |
|---|---|---|
| `teacher.html` | You, on your laptop | Create and delete games, open/close each year's market, swap offers, fire events, see the answer key |
| `display.html` | The projector | Join code + QR, cash-flow diagrams, answer reveal, Top 5 boards, event announcements |
| `student.html` | Students' phones | Join, buy shares, choose savings, submit a plan, see their money and rank |

The site is plain HTML and JavaScript (no build step), hosted on GitHub Pages. Data lives in Firebase Realtime Database.

## Try it first (no setup)

Until you paste your Firebase settings, the app runs in **demo mode**: everything is stored in one browser, so you can play a whole game alone.

1. Put the files on GitHub Pages (steps 6–7 below), or run a local server in this folder: `python3 -m http.server 8000`, then open `http://localhost:8000`.
2. Open `teacher.html` and create a game.
3. In other tabs of the same browser, open the display link and `student.html` a few times (each tab is one student).

Opening the `.html` files directly from your disk (`file://`) does not work, because browsers block JavaScript modules there.

## Setup for a real class (about 15 minutes)

### 1. Create a Firebase project
Go to <https://console.firebase.google.com>, click **Create a project**, and give it a name. Google Analytics is not needed. The free Spark plan is enough.

### 2. Turn on sign-in
**Build → Authentication → Get started → Sign-in method**, then enable:
- **Anonymous** (students and the display; nobody needs an account)
- **Email/Password** (only you)

### 3. Create the database and paste the security rules
**Build → Realtime Database → Create database.** Pick a location and start in **locked mode**.
Open the **Rules** tab, replace everything with the contents of `database.rules.json`, and click **Publish**.

> **Already set up with the first version?** Paste and publish `database.rules.json` again. The new rules add permission for you to delete your own games; without them **Delete** gives a permission error.

The rules are what stop students from giving themselves money:
- Only the teacher who created a game can change balances, the market, or events, or delete the game.
- A student can only write their own plan, and only while the market is open.
- A name can only be reclaimed with the matching PIN.

### 4. Copy your web app config into `js/config.js`
**Project settings (gear icon) → General → Your apps → Web (`</>`)**, register an app (no hosting needed), and copy the `firebaseConfig` values into `js/config.js`.
Make sure `databaseURL` is filled in; it appears after step 3. If it's missing, copy it from the top of the Realtime Database page.

This config is not secret: every Firebase web app ships it to the browser. The security rules protect your data.

### 5. (Optional) Check the SDK version
`js/config.js` loads Firebase JavaScript SDK 12.19.0 from Google's CDN. You can change `FIREBASE_VERSION` to a newer release later.

### 6. Put the site on GitHub
Create a repository and upload every file and folder here (`index.html`, `student.html`, `teacher.html`, `display.html`, `css/`, `js/`, `vendor/`, and the rest). Keep the folder structure.

### 7. Turn on GitHub Pages
**Repository → Settings → Pages → Build and deployment**: Source *Deploy from a branch*, branch `main`, folder `/ (root)`. After a minute your site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

### 8. Authorize the domain in Firebase
**Authentication → Settings → Authorized domains → Add domain**: `YOUR-USERNAME.github.io`.

### 9. Create your teacher account
Open `https://YOUR-USERNAME.github.io/REPO-NAME/teacher.html` and click **Create teacher account**. Any email and password work. Anyone could make an account this way, but they can only see and control their own games.

## Running a class session

1. **Before class:** open the teacher console and create a game. You set:
   - starting money ($10,000)
   - number of years (8)
   - bank rate (5%), which is the interest rate students should use for PW, FW and AW
   - overdraft rate (15%)
   - savings withdrawal penalty (5%)
   - investments offered each year (4)
2. **Projector:** click **Open big-screen display**. Students scan the QR code or type the URL and game code.
3. **Students join** with a name and a 4-digit PIN they make up. If a phone dies or they switch devices, they sign in again with the **same name and PIN** and get their money back. On the same phone, reloading puts them straight back in. If someone forgets their PIN, click **New PIN** next to their name.
4. **Each year** the big button at the top of the console walks you through four steps:

   | Step | What happens |
   |---|---|
   | Open the market | Students see this year's offers and build a plan. Plans can be changed until you close. A timer is optional. |
   | Close the market | Every submitted plan is carried out. Students who didn't submit keep what they had. Tick **Show PW, FW, AW and IRR on the big screen** to discuss which offers were good deals. |
   | End the year | Savings earn a year of interest, every investment pays its cash flow, and the leaderboard updates. |
   | Check the next year's offers | They are drawn at random. Untick any, click **Draw 4 new offers**, swap one in from the full list, or add your own. |

5. **Events** can be fired at any time from the middle column, and they flash on the big screen. Every event hits the whole class the same way. They are the only uncertainty in the game; without them every investment pays exactly what its diagram shows. Preset events:
   - interest rates up 2% / down 2%
   - car repair bill: everyone pays 5% of starting money ($500 by default)
   - tax refund: everyone receives 5% of starting money

   A custom event can charge or pay any amount of cash, or move the bank rate.
6. **Big screen:** on *Automatic* it shows the market during the year, and after each year it shows **Top 5 in every category**: four lists (net worth, liquid capital, gain last year, diversification) with names only, no dollar amounts. **Big screen shows** lets you force a view, including the old leaderboard with values.
7. **End of game:** final net worth podium. Pick *Top 5 in every category* to show names only instead. **Download results (CSV)** gives each student's net worth by year and the penalties they paid.
8. **Cleaning up:** on the **Your games** page each saved game has a **Delete** button (there's also **Delete game** in the console). Deleting removes the game and all student data from Firebase, which keeps the free plan's storage from filling up. Students and the display still connected see "This game has been deleted".

Keep the teacher console open during the game. It is the referee that adds new students and applies plans. If you open the game in a second teacher window, the first one pauses itself.

## How the money works

- **Timing.** The textbook end-of-year convention: in the Year *T* market you pay for purchases at time *T*, and the share pays its cash flow at the end of each following year.
- **Cash earns 0%.** Bank savings earn the bank rate, compounded yearly.
- **Taking money out of savings costs a penalty** (5% by default) on the amount withdrawn. That includes buying shares with savings money and bills that cash can't cover. So a dollar saved for one year and then withdrawn comes back as $0.9975, less than cash. A dollar left for two years comes back as $1.047, more than cash. Students have to think about *when* they will need money instead of saving everything. Shares are paid from cash first, and only the rest comes out of savings. The plan screen shows the penalty before they submit.
- **Shares cannot be sold.** That is why net worth and liquid capital can rank students differently.
- **Running out of cash.** If an event or a payment due (for example the College Savings Plan) needs more cash than a student has, it comes from savings first, with the penalty. After that the student goes into overdraft at the overdraft rate. Overdraft is repaid automatically as cash comes in.
- **Net worth** = cash + savings (at full balance) − overdraft + the present worth of each investment's remaining cash flows at the current bank rate. So buying a share with negative PW lowers net worth the moment the market closes. Raising the bank rate also lowers the value of fixed payments students already own.
- **Students never see PW, FW, AW or IRR for an offer.** They get the cash-flow diagram (and a table) and the bank rate, and must work it out. The answer key is in your console, and the big-screen reveal is up to you.

## Investments (answer key at 5%)

Each year's market is drawn at random from these 38 investments. An investment isn't repeated until every one has been offered. Each market includes one investment with a negative PW (a "trap") while any are left. Prices are per share.

| Investment | Category | Price | Life (yr) | PW | AW | IRR |
|---|---|---|---|---|---|---|
| 3D Printing Startup | Tech | $2,500 | 5 | +$401 | +$93 | 9.2% |
| App Studio | Tech | $3,000 | 4 | +$105 | +$30 | 6.2% |
| Bike-Share Station | Business | $1,500 | 5 | +$102 | +$24 | 7.4% |
| Billboard Lease | Business | $1,200 | 3 | −$111 | −$41 | 0.0% |
| Campus Coffee Cart | Food | $800 | 3 | +$44 | +$16 | 7.9% |
| Certificate of Deposit | Bonds and deposits | $1,000 | 8 | +$79 | +$12 | 6.0% |
| City Bond | Bonds and deposits | $1,000 | 5 | +$43 | +$10 | 6.0% |
| College Savings Plan | Bonds and deposits | $500 | 4 | +$72 | +$20 | 6.6% |
| Community Solar Farm | Energy | $3,000 | 10 | +$475 | +$61 | 8.1% |
| Concert Promotion | Business | $2,000 | 2 | +$45 | +$24 | 6.6% |
| Corporate Bond | Bonds and deposits | $1,000 | 5 | −$43 | −$10 | 4.0% |
| Crypto Mining Rig | Tech | $2,000 | 3 | −$94 | −$34 | 2.5% |
| Delivery App Shares | Tech | $1,000 | 4 | +$70 | +$20 | 6.8% |
| Drone Delivery Pilot | Tech | $4,000 | 4 | +$610 | +$172 | 11.4% |
| E-Scooter Fleet | Tech | $2,500 | 4 | −$24 | −$7 | 4.4% |
| Equipment Rental | Business | $1,800 | 3 | +$106 | +$39 | 8.1% |
| Geothermal Heat Pump | Energy | $2,500 | 12 | +$159 | +$18 | 6.1% |
| Grid Battery Storage | Energy | $4,000 | 6 | +$123 | +$24 | 5.8% |
| Gym Equipment Lease | Business | $2,000 | 3 | −$76 | −$28 | 2.7% |
| Hydroponic Greenhouse | Food | $1,200 | 3 | +$40 | +$15 | 6.4% |
| Laundromat Upgrade | Business | $1,800 | 5 | +$148 | +$34 | 7.9% |
| LED Lighting Retrofit | Energy | $1,500 | 2 | +$80 | +$43 | 8.8% |
| Phone Repair Kiosk | Business | $1,500 | 4 | +$273 | +$77 | 12.6% |
| Phone Resale | Tech | $1,000 | 1 | −$10 | −$10 | 4.0% |
| Pop-up Shop | Business | $1,000 | 1 | +$95 | +$100 | 15.0% |
| Rental Duplex Share | Business | $6,000 | 6 | +$269 | +$53 | 5.9% |
| Rooftop Garden | Food | $1,000 | 5 | −$12 | −$3 | 4.7% |
| Sandwich Franchise | Food | $5,000 | 5 | +$195 | +$45 | 6.4% |
| Savings Bond | Bonds and deposits | $1,000 | 8 | +$56 | +$9 | 5.7% |
| Taco Truck | Food | $2,000 | 4 | +$457 | +$129 | 13.7% |
| Treasury Note | Bonds and deposits | $1,000 | 3 | +$19 | +$7 | 5.7% |
| Tutoring Business | Business | $500 | 3 | +$45 | +$16 | 9.7% |
| Used-Car Flip | Business | $3,000 | 1 | +$86 | +$90 | 8.0% |
| Vending Machines | Business | $1,000 | 5 | +$126 | +$29 | 9.4% |
| Wedding Photo Booth | Business | $900 | 3 | +$17 | +$6 | 6.1% |
| Wind Turbine Share | Energy | $2,500 | 8 | +$85 | +$13 | 5.8% |
| Winter Ice Rink | Business | $1,200 | 1 | $0 | $0 | 5.0% |
| Zero-Coupon Bond | Bonds and deposits | $760 | 5 | +$24 | +$5 | 5.6% |

Traps: Billboard Lease, Corporate Bond, Crypto Mining Rig, E-Scooter Fleet, Gym Equipment Lease, Phone Resale, Rooftop Garden. The Winter Ice Rink is exactly break-even (PW = $0, IRR = 5%).

Teaching moments to watch for (swap them in if the draw doesn't bring them):
- **Simple vs. compound.** The 7% simple Savings Bond loses to the 6% compound Certificate of Deposit over 8 years: $1,560 vs $1,593.85.
- **Total cash isn't value.** The Crypto Mining Rig and Billboard Lease pay back more than they cost, but have negative PW at 5%.
- **Coupon vs. bank rate.** The City Bond (6% coupon) beats the bank; the Corporate Bond (4%) doesn't.
- **Different lives.** The Solar Farm has a bigger PW than the Phone Repair Kiosk, but the Kiosk has the bigger AW and IRR.
- **Gradients and uneven flows.** App Studio (growing), Gym Equipment Lease (shrinking), 3D Printing Startup (second payment), Rooftop Garden (deferred).
- **Salvage and disposal.** Taco Truck and Rental Duplex end with a resale; the E-Scooter Fleet ends with a recycling cost.
- **Future worth of a series.** The College Savings Plan commits students to future payments, so watch for penalties and overdrafts.

To change the list, edit `js/catalog.js`: each investment is just a list of cash flows for one share. You can also add investments during a game from the console (**Add your own investment**). They go into the next market.

## Files

```
index.html            landing page with links to the three screens
teacher.html, student.html, display.html
css/                  style.css (shared) + one file per screen
js/config.js          your Firebase settings
js/engine.js          all game math (interest, cash flows, PW/FW/AW/IRR, ranking)
js/catalog.js         investments, default settings and events
js/backend.js         Firebase + demo-mode storage
js/cfd.js             cash-flow diagram drawing
js/game.js, util.js   shared helpers
vendor/qrcode.mjs     QR code generator (MIT licence, Kazuhiko Arase)
database.rules.json   Firebase security rules (paste into the console)
tests/                engine tests: `node --test tests/*.test.mjs`
```

## Limits and notes

- **Class size.** Firebase's free plan allows a limited number of simultaneous connections (about 100), which covers a class plus the display and your console.
- **Duplicate names.** Two students with the same name can't both join; the second is told to add a last initial. Use **Remove** for inappropriate names.
- **Clock accuracy.** Timers use the Firebase server clock, so phones with wrong clocks still count down correctly.
