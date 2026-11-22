import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTestRide, findShowroom, parseDate, parseTime } from '../server/booking.js';

const now = new Date('2026-11-22T10:15:00Z'); // Sunday 3:45 pm IST
const book = (over = {}) => bookTestRide(
  { showroom: 'JP Nagar', date: 'tomorrow', time: '17:00', vehicle: 'Rizta', ...over },
  { now, save() {} },
);

test('nearest showroom for common ways of saying an area', () => {
  const cases = {
    'JP Nagar': 'JP Nagar', 'near jayanagar 4th block': 'Jayanagar', Koramangla: 'Koramangala', 'HSR': 'HSR Layout',
    Hebbal: 'Hebbal', 'Devanahalli': 'Devanahalli', '560064': 'Yelahanka', Indiranagar: 'Indiranagar', Whitefield: 'Whitefield', Bidadi: 'Bidadi',
  };
  for (const [area, expected] of Object.entries(cases)) assert.equal(findShowroom({ area }).showroom, expected, area);
});

test('asks again for unknown areas and other cities', () => {
  for (const area of ['', 'zzzz', 'Andheri West']) assert.equal(findShowroom({ area }).reason, 'area_unknown', area);
  assert.equal(findShowroom({ city: 'Pune', area: 'Baner' }).reason, 'city_not_covered');
  for (const city of ['Bengaluru', 'Bangalore', 'bengalooru']) assert.ok(findShowroom({ city, area: 'Hebbal' }).ok, city);
});

test('dates follow the India calendar', () => {
  const iso = (value, at = now) => parseDate(value, at)?.toISOString().slice(0, 10);
  assert.equal(iso('today'), '2026-11-22');
  assert.equal(iso('tomorrow'), '2026-11-23');
  assert.equal(iso('parso'), '2026-11-24');
  assert.equal(iso('saturday'), '2026-11-28');
  assert.equal(iso('next sunday'), '2026-11-29');
  assert.equal(iso('25 november'), '2026-11-25');
  assert.equal(iso('today', new Date('2026-11-22T19:00:00Z')), '2026-11-23');
  assert.equal(iso('2026-02-31'), undefined);
});

test('times', () => {
  assert.equal(parseTime('17:30'), 1050);
  assert.equal(parseTime('5 pm'), 1020);
  assert.equal(parseTime('12 am'), 0);
  for (const bad of ['5', '25:00', '13 pm', 'evening']) assert.equal(parseTime(bad), null, bad);
});

test('books a valid slot', () => {
  const { ok, booking, say } = book();
  assert.ok(ok);
  assert.equal(booking.date, '2026-11-23');
  assert.equal(booking.demo, true);
  assert.match(say, /डेमो बुकिंग/);
  assert.equal(book({ vehicle: '450X Pro' }).booking.vehicle, '450X Pro');
});

test('refuses slots it cannot promise', () => {
  assert.equal(book({ date: 'today', time: '10:00' }).reason, 'in_past');
  assert.equal(book({ date: '2027-03-01' }).reason, 'too_far');
  assert.equal(book({ time: '22:00' }).reason, 'closed');
  assert.equal(book({ showroom: 'Nagasandra', date: 'today', time: '18:00' }).reason, 'closed');
  assert.equal(book({ showroom: 'Devanahalli', date: 'next sunday' }).reason, 'hours_unknown');
  assert.equal(book({ showroom: 'Bidadi', date: 'friday' }).reason, 'hours_unknown');
  assert.equal(book({ vehicle: 'Activa' }).reason, 'vehicle_unknown');
  assert.equal(book({ showroom: 'Pune' }).reason, 'showroom_unknown');
});
