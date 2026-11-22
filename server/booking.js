import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { dataDir, readJSON } from './config.js';

const { showrooms } = readJSON('docs/bengaluru-showrooms.json');
const { areas } = readJSON('server/areas.json');

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_HI = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
const DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MODELS = { apex: '450 Apex', '450xpro': '450X Pro', '450x': '450X', '450s': '450S', rizta: 'Rizta', konarc: 'Konarc', konark: 'Konarc' };
const DAY_MS = 86_400_000;
const BOOK_AHEAD_DAYS = 30;
const CLOSING_BUFFER_MIN = 30;
// A showroom named after the caller's area wins if it is within this far of the closest one.
const SAME_NAME_MARGIN_KM = 1;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const english = (language) => /^en/i.test(String(language ?? ''));
const speak = (language, hi, en) => (english(language) ? en : hi);
const fail = (language, reason, hi, en) => ({ ok: false, reason, say: speak(language, hi, en) });

// Each alias is its own entry, plus every showroom's own name.
const places = [
  ...Object.entries(areas).flatMap(([names, at]) => names.split('|').map((name) => ({ key: norm(name), at }))),
  ...showrooms.map((s) => ({ key: norm(s.name), at: [s.lat, s.lng] })),
];

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

export function locate(area) {
  const text = String(area ?? '');
  const key = norm(text);
  if (!key) return null;

  const exact = places.find((p) => p.key === key);
  if (exact) return exact.at;

  const pin = text.replace(/\s/g, '').match(/56\d{4}/)?.[0];
  const byPin = pin && showrooms.find((s) => s.pincode === pin);
  if (byPin) return [byPin.lat, byPin.lng];

  // Longest name contained in what the caller said: "sarjapur road" beats "sarjapur".
  const inside = places.filter((p) => p.key.length >= 4 && key.includes(p.key)).sort((a, b) => b.key.length - a.key.length)[0];
  if (inside) return inside.at;

  // Spelling slips from transliteration. Short names must match exactly.
  const close = places.map((p) => ({ ...p, d: editDistance(key, p.key) })).sort((a, b) => a.d - b.d)[0];
  return key.length >= 6 && close.d <= (key.length >= 10 ? 2 : 1) ? close.at : null;
}

function km([lat1, lng1], [lat2, lng2]) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  return Math.hypot(x, (lat2 - lat1) * rad) * 6371;
}

export function findShowroom({ city, area, language } = {}) {
  if (city && !/bengal|bangal|banglor/.test(norm(city))) {
    return fail(language, 'city_not_covered',
      'अभी इस डेमो में सिर्फ़ बेंगलुरु के शोरूम हैं। क्या आप बेंगलुरु में टेस्ट राइड लेना चाहेंगे?',
      'This demo only covers Bengaluru showrooms. Would you like a test ride in Bengaluru?');
  }
  const at = locate(area);
  if (!at) {
    return fail(language, 'area_unknown',
      'यह इलाका मुझे नहीं मिला। आपके पास का कोई बड़ा इलाका बताइए, जैसे कोरमंगला या हेब्बाल।',
      "I couldn't find that area. Could you name a bigger area near you, like Koramangala or Hebbal?");
  }
  const ranked = showrooms.map((s) => ({ s, km: km(at, [s.lat, s.lng]) })).sort((a, b) => a.km - b.km);
  const named = ranked.find((r) => norm(area).includes(norm(r.s.name)) && r.km - ranked[0].km <= SAME_NAME_MARGIN_KM);
  const near = named ?? ranked[0];
  const next = ranked.find((r) => r !== near);
  const n = Math.max(1, Math.round(near.km));
  return {
    ok: true,
    showroom: near.s.name,
    address: near.s.address,
    distance_km: n,
    alternative: next.s.name,
    say: speak(language,
      `आपके सबसे पास Ather का ${near.s.name} शोरूम है, करीब ${n} किलोमीटर दूर।`,
      `The closest Ather showroom is ${near.s.name}, about ${n} kilometres away.`),
  };
}

/** "Now" as India wall-clock time, carried in a Date's UTC fields. */
const istNow = (now) => new Date(now.getTime() + 330 * 60_000);

export function parseDate(value, now = new Date()) {
  const s = String(value ?? '').toLowerCase().trim();
  const ist = istNow(now);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());

  if (/^(day after tomorrow|parso|parson)$/.test(s)) return new Date(today + 2 * DAY_MS);
  if (/^(tomorrow|kal)$/.test(s)) return new Date(today + DAY_MS);
  if (/^(today|aaj)$/.test(s)) return new Date(today);

  const weekday = DAY_EN.findIndex((d) => s === d.toLowerCase() || s === `next ${d.toLowerCase()}`);
  if (weekday >= 0) {
    let ahead = (weekday - ist.getUTCDay() + 7) % 7;
    if (ahead === 0 && s.startsWith('next ')) ahead = 7;
    return new Date(today + ahead * DAY_MS);
  }

  let y, m, d;
  let match;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [+match[1], match[2] - 1, +match[3]];
  } else if ((match = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)$/))) {
    d = +match[1];
    m = MONTH_EN.findIndex((name) => name.toLowerCase() === match[2]);
    if (m < 0) return null;
    y = ist.getUTCFullYear();
    if (Date.UTC(y, m, d) < today) y += 1;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m, d));
  return date.getUTCMonth() === m && date.getUTCDate() === d ? date : null;
}

export function parseTime(value) {
  const match = String(value ?? '').toLowerCase().trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let h = +match[1];
  const min = +(match[2] ?? 0);
  if (match[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (match[3] === 'pm' ? 12 : 0);
  } else if (!match[2]) {
    return null; // A bare "5" could be morning or evening.
  }
  return h < 24 && min < 60 ? h * 60 + min : null;
}

function clock(total, language) {
  const h = Math.floor(total / 60);
  const t = `${h % 12 || 12}${total % 60 ? `:${String(total % 60).padStart(2, '0')}` : ''}`;
  if (english(language)) return `${t} ${h < 12 ? 'AM' : 'PM'}`;
  const part = h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात';
  return `${part} ${t} बजे`;
}

export function bookTestRide({ showroom, date, time, vehicle, language } = {}, { now = new Date(), save = persist } = {}) {
  const key = norm(showroom).replace(/showroom|ather/g, '');
  const shop = showrooms.find((s) => norm(s.name) === key);
  if (!shop) {
    return fail(language, 'showroom_unknown',
      'शोरूम पक्का करने के लिए, आप अपना इलाका फिर से बताइए।',
      'Could you tell me your area again, so I can confirm the showroom?');
  }

  const modelKey = Object.keys(MODELS).find((k) => norm(vehicle).includes(k));
  if (!modelKey) {
    return fail(language, 'vehicle_unknown',
      'आप कौन सा मॉडल चलाना चाहेंगे: 450X, 450X Pro, 450S, 450 Apex, Rizta या Konarc?',
      'Which model would you like: 450X, 450X Pro, 450S, 450 Apex, Rizta or Konarc?');
  }

  const day = parseDate(date, now);
  if (!day) {
    return fail(language, 'date_unclear', 'आप किस तारीख को आना चाहेंगे?', 'Which date would you like to come?');
  }
  const minutes = parseTime(time);
  if (minutes === null) {
    return fail(language, 'time_unclear', 'आप कितने बजे आना चाहेंगे, सुबह या शाम?', 'What time would you like, morning or evening?');
  }

  const ist = istNow(now);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  if (day.getTime() + minutes * 60_000 <= ist.getTime()) {
    return fail(language, 'in_past',
      'वह समय निकल चुका है। कोई आगे का समय बताइए।',
      'That time has already passed. Please pick a later one.');
  }
  if (day.getTime() > today + BOOK_AHEAD_DAYS * DAY_MS) {
    return fail(language, 'too_far', 'अगले तीस दिन के अंदर की तारीख बताइए।', 'Please pick a date within the next thirty days.');
  }

  const hours = shop.hours[DAYS[day.getUTCDay()]];
  if (!hours?.open || !hours?.close) {
    return fail(language, 'hours_unknown',
      `${shop.name} शोरूम का उस दिन का समय मुझे पता नहीं है। कोई और दिन बताइए।`,
      `I don't have ${shop.name}'s hours for that day. Could you pick another day?`);
  }
  const open = parseTime(hours.open);
  const last = parseTime(hours.close) - CLOSING_BUFFER_MIN;
  if (minutes < open || minutes > last) {
    return fail(language, 'closed',
      `उस दिन टेस्ट राइड ${clock(open, language)} से ${clock(last, language)} के बीच हो सकती है। कौन सा समय ठीक रहेगा?`,
      `That day, test rides can start between ${clock(open, language)} and ${clock(last, language)}. What time suits you?`);
  }

  const reference = String(randomInt(1000, 10_000));
  const booking = {
    reference,
    demo: true,
    showroom: shop.name,
    address: shop.address,
    vehicle: MODELS[modelKey],
    date: day.toISOString().slice(0, 10),
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    created_at: now.toISOString(),
  };
  save(booking);

  const [w, d, m] = [day.getUTCDay(), day.getUTCDate(), day.getUTCMonth()];
  return {
    ok: true,
    booking,
    say: speak(language,
      `आपकी डेमो बुकिंग हो गई: Ather ${booking.vehicle}, ${shop.name} शोरूम, ${DAY_HI[w]} ${d} ${MONTH_HI[m]}, ${clock(minutes, language)}। रेफ़रेंस नंबर है ${reference.split('').join(' ')}।`,
      `Your demo booking is done: Ather ${booking.vehicle} at ${shop.name}, ${DAY_EN[w]} ${d} ${MONTH_EN[m]}, ${clock(minutes, language)}. Your reference number is ${reference.split('').join(' ')}.`),
  };
}

function persist(booking) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'bookings.jsonl'), `${JSON.stringify(booking)}\n`);
}
