// Shared helpers for the Geidea Hosted Checkout functions.
// Files starting with "_" are not exposed as routes by Vercel.
import crypto from 'node:crypto';

export const CURRENCY = 'USD';

// Server-side price list: the browser only ever sends a package id, never an amount.
export const PACKAGES = {
    bronze: { name: 'Basic', amount: '59.99' },
    silver: { name: 'Standard', amount: '79.99' },
    gold: { name: 'Premium', amount: '129.99' }
};

// Hosted checkout script per region, from https://docs.geidea.net/docs/geidea-checkout-v2
const HPP_SCRIPTS = {
    'api.merchant.geidea.net': 'https://www.merchant.geidea.net/hpp/geideaCheckout.min.js',
    'api.ksamerchant.geidea.net': 'https://www.ksamerchant.geidea.net/hpp/geideaCheckout.min.js',
    'api.geidea.ae': 'https://payments.geidea.ae/hpp/geideaCheckout.min.js'
};

export const SITE_URL = (process.env.SITE_URL || 'https://www.provinfinder.online').replace(/\/+$/, '');

/** Reads the Geidea settings from environment variables; throws if any are missing. */
export function getConfig() {
    const publicKey = process.env.GEIDEA_MERCHANT_PUBLIC_KEY;
    const password = process.env.GEIDEA_API_PASSWORD;
    const baseUrl = (process.env.GEIDEA_API_BASE_URL || '').replace(/\/+$/, '');
    if (!publicKey || !password || !baseUrl) {
        throw new Error('Geidea is not configured');
    }
    let host;
    try {
        host = new URL(baseUrl).host;
    } catch (e) {
        throw new Error('GEIDEA_API_BASE_URL is not a valid URL');
    }
    return {
        publicKey: publicKey,
        password: password,
        baseUrl: baseUrl,
        // UNVERIFIED for the UAE: Geidea documents this path on the Egypt host only.
        sessionPath: process.env.GEIDEA_SESSION_PATH || '/payment-intent/api/v2/direct/session',
        scriptUrl: process.env.GEIDEA_HPP_SCRIPT_URL || HPP_SCRIPTS[host] || null
    };
}

/** Base64(HMAC-SHA256(apiPassword, parts joined with no separator)), as in Geidea's samples. */
export function sign(password, parts) {
    return crypto.createHmac('sha256', password).update(parts.join(''), 'utf8').digest('base64');
}

export function formatAmount(value) {
    return Number(value).toFixed(2);
}

// UNVERIFIED: Geidea's PHP sample uses "Y/m/d H:i:s"; confirm against the first real session.
export function formatTimestamp(date) {
    const d = date || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '/' + p(d.getUTCMonth() + 1) + '/' + p(d.getUTCDate()) + ' ' +
        p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
}

export function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
