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

## Backlog
- P0: Add Razorpay test keys & Twilio Verify (WhatsApp) keys; remove demo phones before go-live.
- P1: Staff user management UI (create ops/finance/verification accounts), document expiry reminders, budgets/forecasts, PDF report exports, live driver location.
- P2: Corporate client accounts & monthly invoicing, referral/coupons admin, multilingual (Hindi), automated payouts.
