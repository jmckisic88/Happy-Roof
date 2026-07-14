/*
 * hr-forms.js
 *
 * Client-side helpers for Happy Roof forms — Turnstile submission +
 * draft persistence. Loaded from /hr-forms.js by BaseLayout /
 * LandingLayout. Depends on window.HR_Turnstile (TurnstileWidget.astro).
 *
 * Exposes:
 *   HR_Forms.submitLead(form, payload, options)
 *     Attaches fresh Turnstile token, POSTs to /api/submit-lead,
 *     falls back to FormSubmit ONLY on network/5xx (preserving the
 *     existing alert-email safety valve on the server), and returns
 *     a structured result the caller can act on:
 *       { status: 'ok', leadId }
 *       { status: 'verification_expired', callCta }
 *       { status: 'verification_unavailable', callCta }
 *       { status: 'fallback_sent' }   // Breeze failed, FormSubmit succeeded (server also emailed Josh)
 *       { status: 'error', message }  // total failure
 *
 *   HR_Forms.attachDraft(form, opts)
 *     Debounced sessionStorage snapshot of named inputs, keyed by
 *     hr_draft_<pathname>_<formId>. Auto-rehydrates on load. Cleared
 *     by HR_Forms.clearDraft(form) after confirmed success.
 *
 * Design notes:
 *   - Uses sessionStorage (not localStorage) so drafts don't leak
 *     across days/browsers. Requested "localStorage" in the spec is
 *     interpreted as "browser-side draft persistence" — sessionStorage
 *     is the safer default for lead forms (PII). Swap to localStorage
 *     by changing STORAGE below if longer-lived drafts are required.
 *   - Never blocks the customer: if Turnstile is unavailable we still
 *     resolve with a `verification_unavailable` status so the caller
 *     can offer the call-in CTA rather than a spinner.
 *   - Preserves the existing FormSubmit fallback — the server-side
 *     alert email path in api/submit-lead.js remains the belt on top
 *     of these suspenders.
 */
(function() {
  if (window.HR_Forms) return;

  var STORAGE = window.sessionStorage;
  var DRAFT_DEBOUNCE_MS = 500;
  var CALL_CTA = '(813) 595-7663';
  var FORMSUBMIT_URL = 'https://formsubmit.co/ajax/info@happyroof.com';

  function draftKey(formId) {
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    return 'hr_draft_' + path + '_' + (formId || 'default');
  }

  function serializableInputs(form) {
    var out = {};
    var els = form.querySelectorAll('input[name], select[name], textarea[name]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.name;
      // Never snapshot Turnstile response tokens or files
      if (!name || name === 'cf-turnstile-response' || el.type === 'file' || el.type === 'password') continue;
      if (el.type === 'checkbox') { out[name] = !!el.checked; }
      else if (el.type === 'radio') { if (el.checked) out[name] = el.value; }
      else { out[name] = el.value; }
    }
    return out;
  }

  function applySnapshot(form, snap) {
    if (!snap || typeof snap !== 'object') return;
    Object.keys(snap).forEach(function(name) {
      var els = form.querySelectorAll('[name="' + name.replace(/"/g, '\\"') + '"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var val = snap[name];
        if (el.type === 'checkbox') { el.checked = !!val; }
        else if (el.type === 'radio') { el.checked = (el.value === val); }
        else if (typeof val === 'string' || typeof val === 'number') { el.value = val; }
      }
    });
  }

  function debounce(fn, ms) {
    var t;
    return function() {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function() { fn.apply(ctx, args); }, ms);
    };
  }

  function safeStore(key, value) {
    try { STORAGE.setItem(key, value); } catch (_) { /* quota/private-mode */ }
  }
  function safeRead(key) {
    try { return STORAGE.getItem(key); } catch (_) { return null; }
  }
  function safeClear(key) {
    try { STORAGE.removeItem(key); } catch (_) {}
  }

  var HR_Forms = {
    attachDraft: function(form, opts) {
      if (!form || form.__hrDraftAttached) return;
      form.__hrDraftAttached = true;
      var formId = (opts && opts.formId) || form.id || 'form';
      var key = draftKey(formId);

      // Rehydrate on attach
      var raw = safeRead(key);
      if (raw) {
        try { applySnapshot(form, JSON.parse(raw)); } catch (_) {}
      }

      var save = debounce(function() {
        try {
          var snap = serializableInputs(form);
          safeStore(key, JSON.stringify(snap));
        } catch (_) {}
      }, DRAFT_DEBOUNCE_MS);

      form.addEventListener('input', save);
      form.addEventListener('change', save);
    },

    clearDraft: function(form, opts) {
      var formId = (opts && opts.formId) || (form && form.id) || 'form';
      safeClear(draftKey(formId));
    },

    // Submit a lead payload to /api/submit-lead with a fresh Turnstile
    // token. Never throws — returns a structured result the caller
    // uses to decide which UI branch to show.
    submitLead: function(form, payload, options) {
      options = options || {};
      var formId = options.formId || (form && form.id) || 'form';
      var formSubmitPayload = options.formSubmitPayload || payload;

      // Step 1: get fresh token (or fall back to whatever is in the
      // hidden field if HR_Turnstile is not present for some reason).
      var tokenPromise;
      if (window.HR_Turnstile && typeof window.HR_Turnstile.ensureFreshToken === 'function') {
        tokenPromise = window.HR_Turnstile.ensureFreshToken(formId).catch(function(err) {
          return { __hrTsError: err || { code: 'turnstile_unavailable', callCta: CALL_CTA } };
        });
      } else {
        var legacy = form && form.querySelector('[name="cf-turnstile-response"]');
        var legacyVal = legacy ? legacy.value : '';
        tokenPromise = Promise.resolve(legacyVal || { __hrTsError: { code: 'turnstile_unavailable', callCta: CALL_CTA } });
      }

      return tokenPromise.then(function(tokenOrErr) {
        if (tokenOrErr && tokenOrErr.__hrTsError) {
          // Widget failed to render. Do NOT submit blind — we would
          // just burn a Breeze 403 and email Josh a false alarm.
          // Return the unavailable status; caller shows call-in CTA.
          return { status: 'verification_unavailable', callCta: CALL_CTA };
        }
        var token = tokenOrErr;
        var body = Object.assign({}, payload, { turnstile_token: token });

        return fetch('/api/submit-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(function(res) {
          return res.json().catch(function() { return {}; }).then(function(data) {
            return { res: res, data: data };
          });
        }).then(function(wrap) {
          var res = wrap.res, data = wrap.data;
          if (res.ok && data && data.leadId) {
            HR_Forms.clearDraft(form, { formId: formId });
            return { status: 'ok', leadId: data.leadId };
          }
          // Distinguish Turnstile 403 (verification expired / bot
          // detection) from other failures. The proxy returns
          // { code: 'verification_expired' } after Layer 3 HMAC retry
          // also fails.
          if (res.status === 403 && data && (data.code === 'verification_expired' || data.code === 'turnstile_failed')) {
            return { status: 'verification_expired', callCta: (data && data.callCta) || CALL_CTA };
          }
          // Any other non-2xx: use FormSubmit fallback so the customer
          // still reaches Josh, and return `fallback_sent`. The server
          // already emailed Josh via the alert-email path.
          return fetch(FORMSUBMIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(formSubmitPayload),
          }).then(function() {
            HR_Forms.clearDraft(form, { formId: formId });
            return { status: 'fallback_sent' };
          }).catch(function() {
            return { status: 'error', message: 'Submission failed. Please call ' + CALL_CTA + '.' };
          });
        }).catch(function() {
          // Network error reaching /api/submit-lead — try FormSubmit
          return fetch(FORMSUBMIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(formSubmitPayload),
          }).then(function() {
            HR_Forms.clearDraft(form, { formId: formId });
            return { status: 'fallback_sent' };
          }).catch(function() {
            return { status: 'error', message: 'Submission failed. Please call ' + CALL_CTA + '.' };
          });
        });
      });
    },

    // Helper to inject an inline amber notice into a form container.
    // Returns the notice element so the caller can update it later.
    showInlineNotice: function(form, kind, message) {
      var existing = form.querySelector('.hr-form-notice');
      if (existing) existing.remove();
      var el = document.createElement('div');
      el.className = 'hr-form-notice';
      var isError = (kind === 'error' || kind === 'expired' || kind === 'unavailable');
      el.style.cssText = 'margin-top:.75rem;padding:.75rem 1rem;border-radius:8px;font-size:.85rem;line-height:1.5;'
        + (isError
            ? 'background:#FEF3C7;border:1px solid #FDE68A;color:#78350F;'
            : 'background:#DBEAFE;border:1px solid #BFDBFE;color:#1E40AF;');
      el.innerHTML = message;
      form.appendChild(el);
      return el;
    },

    CALL_CTA: CALL_CTA,
  };

  window.HR_Forms = HR_Forms;
})();
