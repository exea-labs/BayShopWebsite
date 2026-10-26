// NOAA/Meeus low-precision solar position (DESIGN.md §A.1, verified 2026-10-23).
// Clock time is PST (UTC−8) on 2027-01-03 at Los Gatos High School. World: x east, y up, z south.
export const SITE = { lat: 37.2233806, lon: -121.9766411, tz: -8, y: 2027, m: 1, d: 3 };
const R = Math.PI / 180;

export function sunAt(minutesPST, s = SITE) {
  let { y, m, d } = s; if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + (minutesPST / 60 - s.tz) / 24;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * R) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * R) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * R) * 0.000289;
  const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * R);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om * R);
  const dec = Math.asin(Math.sin(eps * R) * Math.sin(lam * R));
  const yv = Math.tan(eps * R / 2) ** 2;
  const eot = 4 / R * (yv * Math.sin(2 * L0 * R) - 2 * e * Math.sin(M * R) + 4 * e * yv * Math.sin(M * R) * Math.cos(2 * L0 * R)
            - 0.5 * yv * yv * Math.sin(4 * L0 * R) - 1.25 * e * e * Math.sin(2 * M * R));      // minutes
  const ha = ((minutesPST + eot + 4 * s.lon - 60 * s.tz) / 4 - 180) * R;                       // hour angle, + = afternoon
  const lat = s.lat * R;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  const line = Math.atan(Math.sin(lat) * Math.tan(ha));                                        // hour line, east of north
  return { azDeg: az / R, elDeg: el / R, lineDeg: line / R,
           dir: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)] };  // unit vector TO the sun
}

/** Minutes after midnight, PST. */
export const T_START = 600;   // 10:00
export const T_END = 1065;    // 5:45
export const SUNSET = 1023;   // 5:03, upper limb at the horizon (-0.83°)
export const SESSIONS = [600, 625, 670, 780, 870, 985]; // selected schedule milestones
