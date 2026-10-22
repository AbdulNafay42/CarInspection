// POST /api/create-session  { "package": "bronze" | "silver" | "gold" }
// Creates a Geidea checkout session on the server and returns only what the browser needs.
import crypto from 'node:crypto';
import { CURRENCY, PACKAGES, SITE_URL, getConfig, sign, formatAmount, formatTimestamp } from './_geidea.js';

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
        console.error('create-session: ' + e.message);
        return res.status(503).json({ error: 'not_configured' });
    }
    if (!cfg.scriptUrl) {
        console.error('create-session: no checkout script URL for this base URL');
        return res.status(503).json({ error: 'not_configured' });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const pkg = PACKAGES[String(body.package || '').toLowerCase()];
    if (!pkg) {
        return res.status(400).json({ error: 'invalid_package' });
    }

    const amount = formatAmount(pkg.amount);
    const merchantReferenceId = crypto.randomUUID();
    const timestamp = formatTimestamp();
    const signature = sign(cfg.password, [cfg.publicKey, amount, CURRENCY, merchantReferenceId, timestamp]);

    const payload = {
        amount: Number(amount),
        currency: CURRENCY,
        timestamp: timestamp,
        merchantReferenceId: merchantReferenceId,
        signature: signature,
        paymentOperation: 'Pay',
        language: 'en',
        callbackUrl: SITE_URL + '/api/geidea-callback'
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(cfg.baseUrl + cfg.sessionPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(cfg.publicKey + ':' + cfg.password).toString('base64')
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        const ok = response.ok && String(data.responseCode) === '000' &&
            String(data.detailedResponseCode) === '000' && data.session && data.session.id;
        if (!ok) {
            // Log only the codes: never the request, headers or credentials.
            console.error('create-session: Geidea rejected the request', {
                httpStatus: response.status,
                responseCode: data.responseCode,
                detailedResponseCode: data.detailedResponseCode,
                responseMessage: data.responseMessage
            });
            return res.status(502).json({ error: 'session_failed' });
        }
        return res.status(200).json({ sessionId: data.session.id, scriptUrl: cfg.scriptUrl });
    } catch (e) {
        console.error('create-session: request failed (' + (e.name || 'error') + ')');
        return res.status(502).json({ error: 'session_failed' });
    } finally {
        clearTimeout(timer);
    }
}

function safeJson(text) {
    try { return JSON.parse(text); } catch (e) { return {}; }
}
