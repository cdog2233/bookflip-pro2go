# BookSource Pro

A separate, free-first book sourcing and arbitrage research application. It is not part of the BookFlip Pro2Go inventory workflow.

## Open it
After GitHub Pages deploys, open:
https://cdog2233.github.io/bookflip-pro2go/booksource-pro/

## Current capabilities
- ISBN-10 / ISBN-13 validation and metadata lookup using Google Books, with Open Library fallback. ISBN lookup selects a catalog result that actually contains the requested identifier. Title searches show selectable edition candidates with ISBN, publisher, publication date, and format cues rather than silently choosing the first result.
- Bulk ISBN research queue accepts pasted ISBN lists, validates checksums, deduplicates entries, persists on the current device, and supports continuous camera scanning into the queue. Load each queued ISBN into the finder one at a time for review; the queue does not automatically buy, list, or save sourcing deals.
- Retailer search shortcuts for Walmart, Target, Barnes & Noble, Books-A-Million, AbeBooks, ThriftBooks, Better World Books, BooksRun, Book Outlet, Alibris, Powell's, Sam's Club, and BJ's Wholesale.
- Manual verified retailer price, seller identity, availability, edition-match status, shipping, tax, and other-cost capture. Deals remain in a verification state until the retailer edition is confirmed. Retailer prices are not represented as live or automatically scraped.
- Amazon research fields for ASIN, explicit Amazon edition-match status, selling condition, current and 90-day average sales rank, estimated sales-activity days over a 180-day window (manually observed from Keepa), used-offer count, comparable FBA/FBM prices, eligibility status, eligibility condition, and check date. Eligibility only passes the deal-readiness gate when the condition checked matches the intended selling condition.
- Direct links to the Amazon listing, Keepa product history, Seller Central eligibility check, and Amazon Revenue Calculator.
- Profit and ROI analysis including retailer landed costs, inbound shipping/prep/labels, 15% Media referral-fee assumption, $1.80 media closing-fee assumption, Individual-plan $0.99 per-item fee, optional Professional-plan overhead allocation, FBM buyer shipping revenue, fulfillment cost, other per-unit fees, and an optional price-drop/returns reserve.
- FBA/FBM fulfillment fee must be entered by the user; do not assume one flat fee fits every book. Use the current Amazon Revenue Calculator or Seller Central fee preview. FBA fee entry defaults to "all-in" to avoid double-counting the 3.5% fuel/logistics surcharge. A clearly labeled optional base-fee mode adds 3.5% only when the entered base fee excludes that surcharge; it does not attempt to estimate seasonal peak fees.
- Deal-readiness gates: retailer edition, seller identity, in-stock status, Amazon listing match, seller eligibility, and demand evidence must be checked before a deal can show `MEETS TARGET`. Missing FBA/FBM fulfillment fees produce `NEEDS DATA` rather than silently assuming a generic fee.
- Maximum landed-cost target, configurable minimum profit and ROI, sortable deal comparison, watchlist/status tracking, CSV export, and JSON backup/restore.
- Mobile-friendly independent interface and browser-local storage.

## Important accuracy limits
Retailer prices, stock, coupons, shipping, tax, seller identity, and exact edition must be checked on the retailer page. Search results are leads, not proof that the retailer offer is the same edition or actually purchasable. Some retailer terms prohibit unauthorized scraping or automated site access, so this app uses retailer search links and manual verification rather than pretending to provide live retailer prices.

Amazon price, sales rank, used-offer counts, sales activity, seller eligibility, and listing condition are manual observations unless a supported data source is explicitly connected. A current rank alone does not guarantee sales. Use Keepa history and recent sales activity where possible. The app does not calculate an exact sales velocity from rank or promise that an item will sell. A zero estimated-sales-days entry triggers a low-sales-activity warning; missing or malformed demand metrics keep the deal in a research-needed state.

Amazon fee assumptions must be verified for the exact ASIN. The optional 3.5% surcharge calculation is only an explicit user-selected helper; prefer the Revenue Calculator's total and leave the app in all-in mode to prevent double counting. Amazon's 2026 US fee information states that Media products (including books) have a 15% referral fee and $1.80 closing fee; Individual selling plans also incur a $0.99 per-item fee. FBA fulfillment fees vary by size, weight, price, and date, and 2026 includes a 3.5% fuel/logistics surcharge and holiday peak fees. Use Amazon's Revenue Calculator or Seller Central fee preview for the actual all-in fee. These estimates are not a guarantee of proceeds.

No purchase or Amazon listing is automated. No paid API or shared secret key is required. All records stay in this browser's localStorage and do not sync between devices. Export a JSON backup before clearing browser data or changing devices.

## Privacy
ISBN/title lookup sends the query to Google Books or Open Library. Sourcing records and settings remain in local browser storage unless exported by the user.
