// Shared email sender using Resend
// Used by all cron report endpoints

import { Resend } from 'resend';

export async function sendEmail({ subject, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY not set');
    return { success: false, error: 'Email not configured' };
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Happy Roof Reports <onboarding@resend.dev>',
      to: ['info@happyroof.com'],
      subject: subject,
      text: message,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: err.message };
  }
}
