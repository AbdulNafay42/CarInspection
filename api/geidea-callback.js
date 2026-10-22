// POST /api/geidea-callback  (called by Geidea's servers with the final order status)
// Verifies the signature and the amount, then emails the result. A browser redirect is never
// treated as proof of payment.
//
// UNVERIFIED: Geidea documents the signed fields but not the exact JSON layout of the callback,
// so the extraction below accepts both a nested "order" object and top-level fields.
import { CURRENCY, PACKAGES, getConfig, sign, formatAmount, safeEqual, escapeHtml } from './_geidea.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'method_not_allowed' });
    }

    let cfg;
    try {
        cfg = getConfig();
    } catch (e) {
        console.error('geidea-callback: ' + e.message);
        return res.status(503).json({ error: 'not_configured' });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const order = (body.order && typeof body.order === 'object') ? body.order : body;
    const f = {
        orderId: pick(order.orderId, body.orderId),
        status: pick(order.status, body.status),
        amount: pick(order.amount, body.amount),
        currency: pick(order.currency, body.currency),
        reference: pick(order.merchantReferenceId, body.merchantReferenceId),
        timestamp: pick(body.timeStamp, body.timestamp, order.timeStamp, order.timestamp),
        signature: pick(body.signature)
    };
    if (Object.keys(f).some((k) => f[k] === undefined || f[k] === null || f[k] === '')) {
        console.error('geidea-callback: missing fields');
        return res.status(400).json({ error: 'bad_request' });
    }

    // Documented canonical string: publicKey + amount + currency + orderId + status + merchantReferenceId + timestamp
    const expected = sign(cfg.password, [cfg.publicKey, formatAmount(f.amount), f.currency, f.orderId, f.status, f.reference, f.timestamp]);
    if (!safeEqual(expected, f.signature)) {
        console.error('geidea-callback: signature mismatch');
        return res.status(401).json({ error: 'invalid_signature' });
    }

    const code = pick(body.responseCode, order.responseCode);
    const detail = String(pick(body.detailedResponseMessage, order.detailedResponseMessage) || '');
    const cancelled = /cancel/i.test(detail) || /cancel/i.test(String(f.status));
    const amountOk = String(f.currency).toUpperCase() === CURRENCY &&
        Object.keys(PACKAGES).some((k) => formatAmount(PACKAGES[k].amount) === formatAmount(f.amount));
    const succeeded = String(f.status).toLowerCase() === 'success' && (code === undefined || String(code) === '000');

    let outcome;
    if (cancelled) outcome = 'cancelled';
    else if (succeeded && amountOk) outcome = 'paid';
    else if (succeeded && !amountOk) outcome = 'review';   // paid, but amount/currency not in our price list
    else outcome = 'failed';

    if (outcome !== 'cancelled') {
        await notify(outcome, f, detail);
    }
    // Always 200 once the message is authentic, so Geidea does not keep retrying.
    return res.status(200).json({ received: true });
}

function pick() {
    for (let i = 0; i < arguments.length; i++) {
        if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return undefined;
}

function safeJson(text) {
    try { return JSON.parse(text); } catch (e) { return {}; }
}

const LABELS = {
    paid: 'PAID',
    review: 'NEEDS REVIEW - UNEXPECTED AMOUNT',
    failed: 'NOT PAID'
};

async function notify(outcome, f, detail) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.NOTIFY_EMAIL;
    const from = process.env.MAIL_FROM;
    const line = LABELS[outcome] + ' | order ' + f.orderId + ' | ' + formatAmount(f.amount) + ' ' + f.currency + ' | ref ' + f.reference;
    if (!apiKey || !to || !from) {
        console.log('geidea-callback (email not configured): ' + line);
        return;
    }
    const rows = [
        ['Result', LABELS[outcome]],
        ['Geidea order ID', f.orderId],
        ['Merchant reference', f.reference],
        ['Amount', formatAmount(f.amount) + ' ' + f.currency],
        ['Status', f.status],
        ['Details', detail || '-']
    ];
    const html = '<h2>Geidea payment: ' + escapeHtml(LABELS[outcome]) + '</h2><table cellpadding="6">' +
        rows.map((r) => '<tr><td><b>' + escapeHtml(r[0]) + '</b></td><td>' + escapeHtml(r[1]) + '</td></tr>').join('') + '</table>';
    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: from, to: [to], subject: 'Payment ' + LABELS[outcome] + ' - ' + formatAmount(f.amount) + ' ' + f.currency, html: html })
        });
        if (!r.ok) console.error('geidea-callback: email service returned ' + r.status);
    } catch (e) {
        console.error('geidea-callback: email request failed');
    }
}
