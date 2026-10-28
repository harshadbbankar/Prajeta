# Prajeta — PRD

## Original problem statement
"Follow the prompt and start building a wonderful interactive website, mobile app for customer and driver and ERP." (Master prompt docx: Prajeta — professional drivers for customers' own vehicles across India; public website, customer app, driver app, ERP/admin, business-owner intelligence.)

User choices: name Prajeta · phone login via WhatsApp OTP · Razorpay test mode · balanced depth · booking confirmed only after 20% advance payment.

## Architecture
- Expo Router app (one codebase = website on web + mobile app). Role areas: `/` landing (website), `/customer/*` tabs, `/driver/*` tabs, `/admin/*` tabs + `/erp/*` modules.
- FastAPI (`server.py` auth/public/customer/payments/support, `driver_routes.py`, `admin_routes.py`, `logic.py` fares/offers, `seed.py`) + MongoDB. Money stored in paise.
- Auth: phone OTP → JWT. Twilio Verify (WhatsApp channel) when keys exist; else on-screen preview code. Demo phones (DEMO_PHONES/DEMO_OTP).
- Payments: Razorpay orders + hosted checkout page + signature verify + webhook + order polling. Keys not yet provided → online pay disabled; staff can record cash advance.
- Driver documents: Emergent Object Storage (private), served only to the driver/verification staff.

## Implemented (2026-06)
- Website: hero, quick booking, services, how it works, safety, corporate, cities, FAQ, WhatsApp/call, footer policy pages, service detail pages, track booking, enquiry forms.
- Customer: booking wizard with server fare (GST, night, city multiplier, coupon), 20% advance gate, booking detail with progress, trip OTP, driver card, pay balance, invoice/receipt, cancel/reschedule/review/incident, bookings list, support tickets, notifications.
- Driver: onboarding + document upload + submit, verification status, online toggle, broadcast/direct offers with atomic accept, trip workflow (arrive, OTP start, complete with cash), delay/no-show/incident, earnings & payouts.
- ERP: dashboard KPIs w/ period+city filters, dispatch (assign/reassign, eligibility checks, quotes, exceptions, cash, fare adjust), driver verification, customers restrict, tariffs/cities, settings, audit log, finance (payments/refunds/expenses/payouts), tickets, enquiries.
- Owner intelligence: KPIs vs previous period, P&L, service & city profitability, rule-based insights, action plan, pricing simulator, CSV export, data-quality warnings, KPI definitions.
- Synthetic demo history seeded (flagged is_demo).

## Iteration 10 (2026-06)
- ERP Referral leaderboard (/erp/referrals, More → Referral leaderboard; owner/finance in menu, ops read-only via API): top referrers by completed friends, revenue, credit; recent referred bookings; Say thanks on WhatsApp; Give thank-you credit (owner/finance, audit + notification).
- Android push google-services.json still not provided (user skipped twice).

## Iteration 9 (2026-06)
- Referral rewards: each customer gets PRJxxxxx code (Profile + home card, WhatsApp share); friend enters it in coupon field for first booking (only if no other non-cancelled booking); referrer gets credit when friend's booking completes (driver or ops), auto-applied on next booking, restored if that unpaid booking is cancelled; amounts set in ERP settings (default 100/100). Promo cost absorbed by Prajeta (driver share unaffected).
- Driver payout requests: driver chooses amount (min 100, max pending, one open request, needs UPI/bank); finance approves (reference prefilled → PAID payout) or rejects with reason in ERP Finance → Driver payouts.
- Monthly driver statements: /api/driver/statements/YYYY-MM printable HTML/PDF (opening, fare share, adjustments, bonuses, payouts, closing).
- Android push google-services.json still pending from user.

## Iteration 8 (2026-06)
- Emergent Google sign-in for customers & drivers (POST /api/auth/session → app JWT); staff stay phone-only; Google users without phone must verify a mobile number (Profile → Add mobile number, OTP) before booking / driver application; users.phone & users.email unique only when set.
- Emergent push notifications: /api/register-push, send_push relay mirrors every in-app notify() with tap deep links (customer /booking, driver /trip, staff /erp/booking); module-scope handlers + weekly settings nudge in app/_layout.tsx. Works only in deployed builds; google-services.json still to be supplied by user.

## Iteration 7 (2026-06)
- Trusted contacts (customer profile, max 5, +91 normalised): one-tap WhatsApp (wa.me pre-filled) of live trip link from share card and SOS alert from SOS card (user chose tap-to-send, not automatic).
- Driver wallet: pending payout, today/week/month (IST), 14-day chart, per-trip breakdown (fare share + adjustment + badge bonus), payouts tab.
- Badge bonus: owner sets ₹/trip in ERP settings (default Top Rated ₹50, Gold ₹100); added to booking.badge_bonus at completion, included in all payout sums.
- Twilio WhatsApp OTP deferred by user (preview codes kept).

## Iteration 6 (2026-06)
- SOS: customer (booking detail) and driver (trip screen) SOS button during live trips → sos_alerts (phone location if allowed, else driver last known); alerts owner/ops/support; ERP red dashboard banner + /erp/sos (call, acknowledge, resolve with note); public family page shows SOS banner; one active alert per booking side (unique partial index).
- Nearest dispatch: broadcast offers in waves by distance to pickup (3 nearest now, next 5 +3 min, rest +6 min; badge = one wave earlier; first non-empty wave always immediate); background loop notifies later waves; driver offer shows km from pickup.

## Iteration 5 (2026-06)
- Share trip link: customer shares no-login /live/{token} page (WhatsApp / copy / share sheet; stop sharing); public payload hides phones, OTP, address; ends with the trip.
- Driver badges: Top Rated (4.5+, 5+ reviews), Gold Star (4.8+, 10+); recomputed per review + startup; badge holders see broadcast offers 5 min early (visible_at), others later; shown to customer, driver, ERP.
- ERP live map: /erp/live-map (dispatch button, More, booking detail) — online/on-trip drivers by city or nearest-first for a booking with Offer job; drivers share presence location while online; eligible drivers list shows distance + badge.

## Iteration 4 (2026-06)
- Live ride tracking: driver trip screen shares foreground GPS (expo-location, permission flow w/ Open Settings) → POST /api/driver/jobs/{id}/location; customer booking screen shows live map (OSM tiles proxied via /api/tiles, cached) + ETA/distance to pickup or destination (GET /api/bookings/{id}/tracking; Nominatim geocode cached, city-centre fallback).
- Ratings: review tags, driver notified, low ratings alert admins; driver profile "My ratings"; ERP More → Driver ratings leaderboard (Bayesian score, low-rating alerts).
- Receipts: invoice shows 20% advance, advance paid, balance paid, remaining balance + status stamp; native downloads PDF (expo-print + share sheet), web opens printable page.

## Iteration 3 (2026-06)
- Staff performance (ERP → More → Staff performance, owner/super_admin): per-staff tickets handled/resolved, first-response time, driver approvals, docs verified, dispatches & avg dispatch time (confirmed → offered), quotes, finance actions, weighted score, period filters.
- Document expiry reminders extended to identity, police verification and address proof (30/15/7/1 days); expired identity/police docs pause the driver (docs_expired) until a valid copy is verified. Driver "Valid till" inputs, driver home warning card, ERP "Document expiry" list per document.

## Iteration 2 (2026-06)
- Licence reminders: background check every 6h (licence.py) sends driver + verification-team reminders at 30/15/7/1 days (once each); expired drivers auto-paused (offline, offers withdrawn, cannot go online/accept). Driver renewal upload (licence_renewal) → verification verifies/rejects → licence updated & unpaused. ERP "Licence expiry" screen + dashboard alert; driver home warning card.
- Staff accounts: ERP "Staff & access" (owner/super_admin) to add/change role/pause ops, verification, support, finance, super_admin (owner only). Role-scoped ERP tabs/menus (`can()` in src/auth.tsx) mirroring backend permissions; "Assigned to me" ticket filter.
- WhatsApp login: Twilio Verify (channel=whatsapp) wired; activates when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE are set.

## Backlog
- P0: Add Razorpay test keys & Twilio Verify (WhatsApp) keys; remove demo phones before go-live.
- P1: Staff user management UI (create ops/finance/verification accounts), document expiry reminders, budgets/forecasts, PDF report exports, live driver location.
- P2: Corporate client accounts & monthly invoicing, referral/coupons admin, multilingual (Hindi), automated payouts.
