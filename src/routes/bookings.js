// routes/bookings.js — Lavira booking webhooks + post-booking content flow
'use strict';
const express = require('express');
const { v4: uuid } = require('uuid');
const cfg   = require('../config');
const BRAND = require('../orchestrator/brand');
const { bookings, log } = require('../orchestrator/memory');
const { generatePromoPackage } = require('../content/ai-captions');
const promoEng = require('../engines/promo');
const fs   = require('fs');
const path = require('path');

const router = express.Router();

// Helper: generate post-booking content for a confirmed booking
async function generateBookingContent(booking) {
  const context = [
    `Guest "${booking.guest_name}" just booked`,
    booking.package_name ? `the "${booking.package_name}" package` : '',
    booking.destination  ? `to ${booking.destination}` : '',
    booking.travel_date  ? `(travelling ${booking.travel_date})` : '',
    'Create a warm thank-you + excitement post for our social channels.'
  ].filter(Boolean).join(' ');

  const destination = booking.destination || BRAND.destinations[0];
  const profiles    = ['instagram_post', 'instagram_story', 'facebook_feed'];
  const jobId       = 'bkg_content_' + uuid().slice(0, 8);
  const stateFile   = path.join(cfg.OUTPUTS_DIR, `${jobId}.json`);

  // Write initial state
  fs.writeFileSync(stateFile, JSON.stringify({
    status: 'processing', jobId,
    mediaType: 'booking_content',
    destination, context, profiles,
    bookingId: booking.booking_id
  }));

  log.insert({ jobId, mediaType: 'booking_content', destination, theme: 'guest_testimonial', platforms: profiles, caption: '' });

  // Run async — caller doesn't await
  promoEng.generateAutoPromo({ destination, theme: 'guest_testimonial', context, profiles })
    .then(result => {
      const filenames = (result.results || []).map(r => r.filename).filter(Boolean);
      fs.writeFileSync(stateFile, JSON.stringify({
        status: 'done', jobId, mediaType: 'booking_content',
        destination, context, profiles,
        bookingId: booking.booking_id,
        promo: result.promo,
        results: result.results,
        stockCredit: result.stockCredit
      }));
      log.update(jobId, { status: 'done', outputs: JSON.stringify(filenames) });
      bookings.markContentTriggered(booking.booking_id, jobId);
    })
    .catch(err => {
      fs.writeFileSync(stateFile, JSON.stringify({ status: 'error', jobId, error: err.message }));
      log.update(jobId, { status: 'error' });
    });

  return jobId;
}

// ── POST /api/bookings/webhook ────────────────────────────────────────────────
// Accepts: { source, bookingId, guestName, guestEmail, destination,
//             packageName, travelDate, partySize, notes, autoTriggerContent }
router.post('/webhook', async (req, res) => {
  try {
    const b = req.body || {};
    const bookingId = bookings.insert({
      bookingId:   b.bookingId   || b.booking_id,
      source:      b.source      || 'webhook',
      guestName:   b.guestName   || b.guest_name   || 'Guest',
      guestEmail:  b.guestEmail  || b.guest_email  || '',
      destination: b.destination || '',
      packageName: b.packageName || b.package_name || '',
      travelDate:  b.travelDate  || b.travel_date  || '',
      partySize:   b.partySize   || b.party_size   || 1,
      notes:       b.notes       || '',
      meta:        b.meta        || {}
    });

    let contentJobId = null;
    if (b.autoTriggerContent !== false) {
      const booking = bookings.getById(bookingId);
      contentJobId = await generateBookingContent(booking);
    }

    res.json({ success: true, bookingId, contentJobId, message: 'Booking recorded' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/bookings/record ─────────────────────────────────────────────────
// Manual booking entry (MCP-friendly — same fields as webhook)
router.post('/record', async (req, res) => {
  try {
    const b = req.body || {};
    const bookingId = bookings.insert({ ...b, source: b.source || 'manual' });
    res.json({ success: true, bookingId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/bookings/:id/trigger-content ────────────────────────────────────
router.post('/:id/trigger-content', async (req, res) => {
  try {
    const booking = bookings.getById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const contentJobId = await generateBookingContent(booking);
    res.json({ success: true, bookingId: booking.booking_id, contentJobId, pollUrl: `/api/job/${contentJobId}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/bookings ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 20);
    res.json(bookings.getRecent(limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/bookings/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const b = bookings.getById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    res.json(b);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
