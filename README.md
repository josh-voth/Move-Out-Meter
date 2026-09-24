# Move Out Meter

A no-build, mobile-first move-out cash-flow planner based on the supplied Excel model. It is designed to be understandable on an iPhone by someone who does not live in spreadsheets.

## What it does

- Calculates monthly take-home income from paycheck × paychecks/year + extra monthly income.
- Separates recurring expenses into plain-English **Bills & Basics** and **Fun Money**.
- Lets each expense start **now**, **at move-out**, or on a **custom date**.
- Calculates deposit, first month's rent, utility deposit, moving/setup costs, and an emergency fund.
- Shows the target-date cash surplus/shortfall, post-move monthly leftover, and earliest cash-ready month.
- Turns optional spending into weekly and annual dollars and shows what cutting fun money in half does to the move-out timeline.
- Shows a savings-road chart, paycheck split, fund breakdown, and detailed monthly forecast.
- Saves up to 30 scenarios in browser storage, with load and delete controls.
- Creates shareable URLs containing a copy of the scenario. On iPhone it uses the native Share sheet when available.
- Can be installed to the iPhone Home Screen as a lightweight web app.

## GitHub Pages deployment

1. Create a new GitHub repository, for example `move-out-meter`.
2. Put these files in the repository root.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. GitHub will provide a `https://USERNAME.github.io/move-out-meter/` address.

There is no build step and no package manager.

## Saved scenarios

Saved plans use `localStorage`, so they stay on that browser/device. Clearing browser data removes them. Shared links are portable because the plan is encoded in the URL hash.

## Optional emailed run reports

GitHub Pages cannot safely hold an email-provider API key. The included `report-worker.js` is a Cloudflare Worker template that can send reports through Resend without exposing your API key in the website.

The app intentionally shows a short disclosure when owner reporting is enabled. It does not include covert reporting.

### Worker setup

1. Create a Cloudflare Worker and paste in `report-worker.js`.
2. Add these secrets/variables to the Worker:
   - `RESEND_API_KEY`
   - `REPORT_TO`
   - `REPORT_FROM`
   - `ALLOWED_ORIGIN`, such as `https://USERNAME.github.io`
3. Deploy the Worker.
4. Open `config.js` and paste the Worker URL into `reportEndpoint`.
5. Commit the updated `config.js` to GitHub.

A report is triggered only when the user taps **Check my plan**, not on every input change.

## Spreadsheet mapping

The defaults mirror the uploaded workbook:

- Start: October 1, 2026
- Target move: January 1, 2027
- Savings: $1,825
- Net paycheck: $963.25 × 26/year
- Extra monthly income: $250
- Rent: $750
- Utilities: $200
- Truck insurance: $297.77
- Truck maintenance: $50
- Phone: $45, starting July 2027
- Groceries: $200
- Gas: $200
- Restaurants: $200
- Entertainment: $250
- Gym: $55
- Deposit: $750
- First month's rent: $750
- Utility deposit: $250
- Moving/setup: $500
- Emergency fund: 2 months of recurring bills & basics

## Important modeling note

The **cash-ready date** asks one question: “At the beginning of this month, before paying move-in costs, is there enough cash to cover the full launch fund?” The app separately checks whether the recurring post-move budget is positive, because having enough cash to sign a lease is not the same thing as being able to afford every month after that.
