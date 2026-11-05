# BookSource Pro

A separate, free-first book sourcing and arbitrage research application.

## Open it
After GitHub Pages deploys, open:
https://cdog2233.github.io/bookflip-pro2go/booksource-pro/

## Included in the first version
- ISBN-10 / ISBN-13 validation and book metadata lookup (Google Books, with Open Library fallback).
- Retailer search links for Walmart, Target, Barnes & Noble, Books-A-Million, AbeBooks, and ThriftBooks.
- Manual verified retailer price, shipping, tax, and other-cost capture.
- Amazon resale price and editable FBA / FBM fee assumptions.
- Net profit, ROI, maximum buy cost, target decision, sortable comparison table.
- Local watchlist, status tracking, CSV export, JSON backup/restore.
- Mobile-friendly independent interface.

## Data accuracy and limitations
Retailer prices are not scraped or represented as live unless the user verifies them on the retailer site and enters them. Retailer search pages may vary by region, stock, seller, and ISBN. A title match is not proof of an exact edition. Amazon price, fees, offer availability, and listing eligibility are user-entered assumptions in this version. No purchase or listing is automated. All records are stored in this browser's localStorage and do not sync between devices.

Google Books and Open Library are used only for bibliographic metadata lookup, not price data. Respect their API usage policies. Amazon integrations require seller authorization and applicable SP-API onboarding/roles; they are not included in this zero-cost starter.

## Privacy
No user account, analytics, backend, API key, or paid AI service is required. The ISBN/title lookup sends the query to Google Books or Open Library. Sourcing records remain in local browser storage unless exported by the user.
