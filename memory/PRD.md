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
