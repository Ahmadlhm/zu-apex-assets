const gateNames: Record<string, string> = {
  Bank_Gate: 'بوابة البنك',
  Bus_Park: 'بوابة الباصات',
  Car_Boom_Gate: 'البوابة الرئيسية',
  Car_Turn_Style: 'البوابة الرئيسية',
  'Dent Turnstile': 'بوابة طب الأسنان',
  Dent_Barrier: 'بوابة طب الأسنان',
  Dent_TS2: 'بوابة طب الأسنان',
  'GATE 4': 'بوابة رقم 4',
  'Gate 5 QR': 'الدخول عبر QR',
  Gate3_TS1: 'بوابة رقم 3',
  Gate3_TS2: 'بوابة رقم 3',
  Gate4_A1: 'بوابة رقم 4',
  Gate4_B1: 'بوابة رقم 4',
  Gate5: 'بوابة رقم 5',
  Gate5_Boom_IN: 'بوابة رقم 5',
  'Gate5_Boom_IN(UHF)': 'بوابة رقم 5',
  Gate5_Boom_OUT: 'بوابة رقم 5',
  'Gate5_Boom_OUT(UHF)': 'بوابة رقم 5',
  Gate9_B: 'بوابة رقم 9',
  Gate9_TS1: 'بوابة رقم 9',
  Gate9_TS2: 'بوابة رقم 9',
  Gate9_TS3: 'بوابة رقم 9',
  Gate9_TS4: 'بوابة رقم 9',
  QR_Zone: 'الدخول عبر QR',
  Tech_Cntr: 'البوابة رقم 6 - الكلية التقنية',
  Zarqi: 'زاركي',
}

export const mapZoneToGate = (zoneName: string) => gateNames[zoneName] ?? zoneName

// The filtered ORDS endpoint accepts source zone names, while the UI uses
// canonical gate labels. Always include the label itself for an unmapped zone.
export const zoneNamesForGate = (gate: string) => [
  ...new Set([gate, ...Object.entries(gateNames)
    .filter(([, label]) => label === gate)
    .map(([zone]) => zone)]),
]

export const zoneKeys = Object.keys(gateNames)
