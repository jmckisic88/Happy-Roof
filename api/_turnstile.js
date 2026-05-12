// Cloudflare Turnstile token validation
// Used by all form-receiving API endpoints to block bot submissions.

export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // If the secret isn't configured (e.g. dev environment), don't block submissions.
  // This avoids accidentally rejecting all leads if the key is missing.
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not configured — skipping verification');
    return { success: true, skipped: true };
  }

  // If the token is missing, fail closed.
  if (!token) {
    return { success: false, error: 'Missing Turnstile token' };
  }

  try {
    const params = new URLSearchParams({
      secret,
      response: token,
    });
    if (ip) params.append('remoteip', ip);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await resp.json();
    if (!data.success) {
      return { success: false, error: 'Turnstile verification failed', codes: data['error-codes'] };
    }
    return { success: true };
  } catch (err) {
    console.error('Turnstile verify error:', err);
    // Fail open on network errors to avoid blocking legitimate users if Cloudflare is down.
    return { success: true, networkError: true };
  }
}

// Get the client IP from a Vercel request
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    null
  );
}
