/*
 * English / Dutch language switcher.
 *
 * Markup contract (all optional, combinable on one element):
 *   data-i18n="key"            plain text; keeps child icons/dots, only swaps the text node
 *   data-i18n-html="key"       translated string contains inline markup (<span>, <strong>, <br>…)
 *   data-i18n-keep="id,id"     with data-i18n-html: ids whose live text (set by page scripts) is preserved
 *   data-i18n-attr="attr:key;attr:key"   translate attributes (aria-label, alt, placeholder, title, content)
 *   data-i18n-vars="1|13"      values for {0} {1} … placeholders in the string
 *   data-lang-select           a <select> that becomes the language switcher
 *
 * Strings live in i18n-dict.js (window.I18N_DICT). English is the default and
 * is left untouched in the DOM until the visitor picks another language.
 * Page scripts can call window.i18nT(key, fallback, [vars]) for runtime text and
 * listen for the "i18n:change" event on document.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'lang';
    var DEFAULT_LANG = 'en';
    var LANGS = [
        { code: 'en', label: 'English' },
        { code: 'nl', label: 'Nederlands' }
    ];
    var DICT = window.I18N_DICT || { en: {}, nl: {} };
    var current = DEFAULT_LANG;

    function isSupported(code) {
        for (var i = 0; i < LANGS.length; i++) {
            if (LANGS[i].code === code) return true;
        }
        return false;
    }

    function readStored() {
        try {
            var v = window.localStorage.getItem(STORAGE_KEY);
            return isSupported(v) ? v : null;
        } catch (e) {
            return null;
        }
    }

    function store(code) {
        try {
            window.localStorage.setItem(STORAGE_KEY, code);
        } catch (e) { /* storage unavailable: language just won't persist */ }
    }

    /* Look up a string: selected language, then English, then the caller's fallback. */
    function lookup(key, lang) {
        var table = DICT[lang];
        if (table && typeof table[key] === 'string') return table[key];
        return null;
    }

    function fill(str, vars) {
        if (!vars || !vars.length) return str;
        return str.replace(/\{(\d+)\}/g, function (m, i) {
            return vars[i] !== undefined ? vars[i] : m;
        });
    }

    function t(key, fallback, vars) {
        var s = lookup(key, current);
        if (s === null) s = lookup(key, DEFAULT_LANG);
        if (s === null) s = (typeof fallback === 'string') ? fallback : '';
        return fill(s, vars);
    }

    function resolve(key, vars) {
        var s = lookup(key, current);
        if (s === null) s = lookup(key, DEFAULT_LANG);
        return s === null ? null : fill(s, vars);
    }

    function varsOf(el) {
        var raw = el.getAttribute('data-i18n-vars');
        return raw ? raw.split('|') : null;
    }

    function setText(el, value) {
        var hasChildElements = false;
        var i;
        for (i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 1) { hasChildElements = true; break; }
        }
        if (!hasChildElements) {
            el.textContent = value;
            return;
        }
        /* Keep icons / dots: only replace the first non-empty text node. */
        for (i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue.trim() !== '') {
                var lead = n.nodeValue.match(/^\s*/)[0];
                var trail = n.nodeValue.match(/\s*$/)[0];
                n.nodeValue = lead + value + trail;
                return;
            }
        }
    }

    function setHtml(el, value) {
        var keepAttr = el.getAttribute('data-i18n-keep');
        var saved = {};
        if (keepAttr) {
            keepAttr.split(',').forEach(function (id) {
                var node = document.getElementById(id);
                if (node) saved[id] = node.textContent;
            });
        }
        /* value comes from our own dictionary file, never from user input */
        el.innerHTML = value;
        Object.keys(saved).forEach(function (id) {
            var node = document.getElementById(id);
            if (node) node.textContent = saved[id];
        });
    }

    function apply(root) {
        root = root || document;
        var nodes, i, el, val;

        nodes = root.querySelectorAll('[data-i18n]');
        for (i = 0; i < nodes.length; i++) {
            el = nodes[i];
            val = resolve(el.getAttribute('data-i18n'), varsOf(el));
            if (val !== null && val !== '') setText(el, val);
        }

        nodes = root.querySelectorAll('[data-i18n-html]');
        for (i = 0; i < nodes.length; i++) {
            el = nodes[i];
            val = resolve(el.getAttribute('data-i18n-html'), varsOf(el));
            if (val !== null && val !== '') setHtml(el, val);
        }

        nodes = root.querySelectorAll('[data-i18n-attr]');
        for (i = 0; i < nodes.length; i++) {
            el = nodes[i];
            var vars = varsOf(el);
            el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
                var idx = pair.indexOf(':');
                if (idx < 1) return;
                var attr = pair.slice(0, idx).trim();
                var v = resolve(pair.slice(idx + 1).trim(), vars);
                if (v !== null && v !== '') el.setAttribute(attr, v);
            });
        }
    }

    /* ---------- switcher UI (custom dropdown with flags) ---------- */

    var FLAGS = {
        en: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect width="60" height="40" fill="#012169"/>' +
            '<path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/>' +
            '<path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="3"/>' +
            '<path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/>' +
            '<path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="7"/></svg>',
        nl: '<svg viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="2" fill="#AE1C28"/>' +
            '<rect y="2" width="9" height="2" fill="#fff"/><rect y="4" width="9" height="2" fill="#21468B"/></svg>'
    };

    var CSS =
        '.nav-inner>.logo{margin-right:auto}' +
        '.lang-li{display:flex;align-items:center;margin-left:12px}' +
        '.lang-float{position:fixed;top:12px;right:12px;z-index:2000}' +
        '.lang-dd{position:relative;font-family:inherit}' +
        '.lang-btn{display:flex;align-items:center;gap:8px;background:rgba(10,22,40,.92);color:#ccd6f6;' +
        'border:1px solid rgba(200,169,74,.5);border-radius:8px;padding:6px 10px;cursor:pointer;' +
        'font-family:inherit;font-size:.8rem;font-weight:600;letter-spacing:.6px;line-height:1.2;transition:all .2s}' +
        '.lang-btn:hover,.lang-dd.open .lang-btn,.lang-btn:focus-visible{border-color:#c8a94a;color:#c8a94a;outline:none;background:rgba(200,169,74,.1)}' +
        '.lang-flag{display:inline-flex;width:22px;height:16px;border-radius:3px;overflow:hidden;flex-shrink:0;box-shadow:0 0 0 1px rgba(255,255,255,.25)}' +
        '.lang-flag svg{width:100%;height:100%;display:block}' +
        '.lang-caret{width:10px;height:10px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .2s}' +
        '.lang-dd.open .lang-caret{transform:rotate(180deg)}' +
        '.lang-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:168px;margin:0;padding:6px;list-style:none;' +
        'background:#0a1628;border:1px solid rgba(200,169,74,.35);border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.45);z-index:2100}' +
        '.lang-dd.open .lang-menu{display:block}' +
        '.lang-opt{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:#ccd6f6;cursor:pointer;' +
        'font-family:inherit;font-size:.9rem;font-weight:500;white-space:nowrap}' +
        '.lang-opt:hover,.lang-opt:focus{background:rgba(200,169,74,.14);color:#c8a94a;outline:none}' +
        '.lang-opt[aria-selected="true"]{color:#c8a94a;font-weight:700}' +
        '.lang-opt[aria-selected="true"]::after{content:"\\2713";margin-left:auto;padding-left:14px}';

    function injectCss() {
        var style = document.createElement('style');
        style.setAttribute('data-i18n-style', '');
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    var CARET = '<svg class="lang-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4"/></svg>';
    var dropdowns = [];

    function closeAll() {
        dropdowns.forEach(function (d) {
            d.root.classList.remove('open');
            d.btn.setAttribute('aria-expanded', 'false');
        });
    }

    function buildDropdown(sel) {
        var root = document.createElement('div');
        root.className = 'lang-dd';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lang-btn';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', sel.getAttribute('aria-label') || 'Language');
        if (sel.getAttribute('data-i18n-attr')) btn.setAttribute('data-i18n-attr', sel.getAttribute('data-i18n-attr'));
        var menu = document.createElement('ul');
        menu.className = 'lang-menu';
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('tabindex', '-1');
        var opts = {};
        LANGS.forEach(function (l) {
            var li = document.createElement('li');
            li.className = 'lang-opt';
            li.setAttribute('role', 'option');
            li.setAttribute('tabindex', '-1');
            li.setAttribute('data-lang', l.code);
            li.setAttribute('lang', l.code);
            li.innerHTML = '<span class="lang-flag">' + FLAGS[l.code] + '</span><span></span>';
            li.lastChild.textContent = l.label;
            li.addEventListener('click', function () { closeAll(); setLang(l.code); btn.focus(); });
            menu.appendChild(li);
            opts[l.code] = li;
        });
        root.appendChild(btn);
        root.appendChild(menu);
        sel.parentNode.replaceChild(root, sel);
        var d = { root: root, btn: btn, opts: opts };
        dropdowns.push(d);

        function open() {
            closeAll();
            root.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            opts[current].focus();
        }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (root.classList.contains('open')) closeAll(); else open();
        });
        btn.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
        });
        menu.addEventListener('keydown', function (e) {
            var items = LANGS.map(function (l) { return opts[l.code]; });
            var i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (i > -1) items[i].click(); }
            else if (e.key === 'Escape' || e.key === 'Tab') { closeAll(); btn.focus(); }
        });
    }

    function initSwitchers() {
        var selects = document.querySelectorAll('select[data-lang-select]');
        if (selects.length === 0) {
            /* page without a nav switcher: add a small floating one */
            var wrap = document.createElement('div');
            wrap.className = 'lang-float';
            var sel = document.createElement('select');
            sel.setAttribute('data-lang-select', '');
            sel.setAttribute('data-i18n-attr', 'aria-label:ui.language');
            sel.setAttribute('aria-label', 'Language');
            wrap.appendChild(sel);
            document.body.appendChild(wrap);
            selects = [sel];
        }
        for (var i = 0; i < selects.length; i++) buildDropdown(selects[i]);
        document.addEventListener('click', function (e) {
            if (!e.target.closest || !e.target.closest('.lang-dd')) closeAll();
        });
        syncSwitchers();
    }

    function syncSwitchers() {
        dropdowns.forEach(function (d) {
            d.btn.innerHTML = '<span class="lang-flag">' + FLAGS[current] + '</span><span>' +
                current.toUpperCase() + '</span>' + CARET;
            LANGS.forEach(function (l) {
                d.opts[l.code].setAttribute('aria-selected', l.code === current ? 'true' : 'false');
            });
        });
    }

/* ---------- native form validation messages (shown only in Dutch) ---------- */

    function validationKey(field) {
        var v = field.validity;
        if (v.valueMissing) {
            if (field.type === 'checkbox') return 'val.checkbox';
            if (field.type === 'file') return 'val.file';
            if (field.tagName === 'SELECT') return 'val.select';
            return 'val.required';
        }
        if (v.typeMismatch) return field.type === 'email' ? 'val.email' : 'val.type';
        if (v.patternMismatch) return 'val.pattern';
        if (v.tooShort) return 'val.too_short';
        return null;
    }

    function initValidation() {
        document.addEventListener('invalid', function (e) {
            var field = e.target;
            if (!field || !field.setCustomValidity) return;
            field.setCustomValidity('');
            if (current === DEFAULT_LANG) return;
            var key = validationKey(field);
            if (key) {
                var msg = resolve(key, field.minLength > 0 ? [field.minLength] : null);
                if (msg) field.setCustomValidity(msg);
            }
        }, true);
        var clear = function (e) {
            var field = e.target;
            if (field && field.setCustomValidity) field.setCustomValidity('');
        };
        document.addEventListener('input', clear, true);
        document.addEventListener('change', clear, true);
    }

    /* ---------- public API ---------- */

    function setLang(code) {
        if (!isSupported(code)) code = DEFAULT_LANG;
        current = code;
        store(code);
        document.documentElement.setAttribute('lang', code);
        apply(document);
        syncSwitchers();
        try {
            document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: code } }));
        } catch (e) { /* very old browsers: no event */ }
    }

    window.i18n = {
        t: t,
        apply: apply,
        setLang: setLang,
        getLang: function () { return current; }
    };
    window.i18nT = t;

    /* ---------- init ---------- */

    current = readStored() || DEFAULT_LANG;
    document.documentElement.setAttribute('lang', current);
    injectCss();
    initSwitchers();
    initValidation();
    /* English is already in the markup, so only touch the DOM for other languages. */
    if (current !== DEFAULT_LANG) {
        apply(document);
        /* page scripts that ran earlier re-render their runtime text on this event */
        try {
            document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: current } }));
        } catch (e) { /* very old browsers: no event */ }
    }
})();
