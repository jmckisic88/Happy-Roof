// Office closures shown in the top promo bar, the landing-page layout, the
// contact page hours, and the chat widget. Each notice appears at `showFrom`
// and disappears at `endsAt` (Eastern). Pages built before a window opens
// carry the notice hidden; the browser reveals it on schedule and removes it
// when it ends (see components/HolidayClosure.astro). Builds after `endsAt`
// leave it out entirely.
export interface Closure {
  showFrom: string;
  endsAt: string;
  greeting: string;
  occasion: string;
  datesLong: string;
  datesShort: string;
  reopens: string;
}

export const CLOSURES: Closure[] = [
  {
    showFrom: '2026-11-20T00:00:00-05:00',
    endsAt: '2026-11-28T00:00:00-05:00', // closed weekends anyway, so the notice ends Friday night
    greeting: 'Happy Thanksgiving!',
    occasion: 'Thanksgiving',
    datesLong: 'Thu, Nov 26 & Fri, Nov 27',
    datesShort: 'Nov 26 & 27',
    reopens: 'Mon, Nov 30',
  },
  {
    showFrom: '2026-12-14T00:00:00-05:00',
    endsAt: '2027-01-04T00:00:00-05:00',
    greeting: 'Merry Christmas and Happy New Year!',
    occasion: 'the holidays',
    datesLong: 'Dec 24 through Jan 3',
    datesShort: 'Dec 24–Jan 3',
    reopens: 'Mon, Jan 4',
  },
];

// The office checks calls and texts during closures, but nobody answers live.
export const CLOSURE_PHONE_NOTE = "We'll still check calls and texts, but expect voicemail if you call.";

export function upcomingClosures(now: number = Date.now()): Closure[] {
  return CLOSURES.filter((c) => now < Date.parse(c.endsAt));
}

export function closureShowing(c: Closure, now: number = Date.now()): boolean {
  return now >= Date.parse(c.showFrom) && now < Date.parse(c.endsAt);
}
