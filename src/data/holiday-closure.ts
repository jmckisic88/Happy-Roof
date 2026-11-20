// Office closure notice shown in the top promo bar, the landing-page layout,
// the contact page hours, and the chat widget. Expires on its own at `endsAt`:
// builds after that moment render nothing, and pages built before it remove
// the notice in the browser (see components/HolidayClosure.astro).
export const HOLIDAY_CLOSURE = {
  endsAt: '2026-11-28T00:00:00-05:00', // midnight Eastern after the last closed day
  greeting: 'Happy Thanksgiving!',
  occasion: 'Thanksgiving',
  datesLong: 'Thu, Nov 26 & Fri, Nov 27',
  datesShort: 'Nov 26 & 27',
  reopens: 'Mon, Nov 30',
};

export function holidayClosureActive(now: number = Date.now()): boolean {
  return now < Date.parse(HOLIDAY_CLOSURE.endsAt);
}
