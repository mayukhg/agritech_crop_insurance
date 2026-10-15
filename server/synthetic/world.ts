/**
 * Deterministic CropGuard 2.0 synthetic world.
 * Clock: 1 Oct 2026. No Math.random on this path.
 */

export const SYNTHETIC_CLOCK = new Date("2026-10-01T07:00:00+05:30");

export const personas = {
  ramesh: {
    fullName: "Ramesh Patil",
    mobileNumber: "+919800000001",
    userType: "farmer" as const,
    state: "Maharashtra",
    district: "Latur",
    language: "mr-IN",
    crop: "soybean",
    areaHa: "1.20",
    surveyNumber: "LTR-2218",
    coordinates: { lat: 18.4088, lng: 76.5604 },
    upiVpa: "ramesh@upi",
  },
  suresh: {
    fullName: "Suresh Singh",
    mobileNumber: "+919800000002",
    userType: "farmer" as const,
    state: "Punjab",
    district: "Ludhiana",
    language: "pa-IN",
    crop: "wheat",
    areaHa: "10.00",
    surveyNumber: "LDH-9901",
    coordinates: { lat: 30.9010, lng: 75.8573 },
    upiVpa: "suresh@upi",
    sowingDate: "2026-11-15",
  },
  anita: {
    fullName: "Anita Deshmukh",
    mobileNumber: "+919800000003",
    userType: "farmer" as const,
    state: "Maharashtra",
    district: "Wardha",
    language: "mr-IN",
    crop: "cotton",
    areaHa: "2.00",
    surveyNumber: "WRD-4410",
    coordinates: { lat: 20.7453, lng: 78.6022 },
    upiVpa: "anita@upi",
  },
  ibrahim: {
    fullName: "Ibrahim Khan",
    mobileNumber: "+919800000004",
    userType: "farmer" as const,
    state: "Maharashtra",
    district: "Aurangabad",
    language: "hi-IN",
    crop: "cotton",
    areaHa: "1.00",
    surveyNumber: "ABD-1", // too short → land_not_verified
    coordinates: { lat: 19.8762, lng: 75.3433 },
    upiVpa: "ibrahim@upi",
  },
  meera: {
    fullName: "Meera",
    mobileNumber: "+919800000005",
    // no user row — awaiting_registration
  },
  pooja: {
    fullName: "Pooja Shah",
    mobileNumber: "+919800000099",
    userType: "insurer" as const,
    state: "Maharashtra",
    district: "Pune",
  },
} as const;

/** 21 consecutive dry days for Wardha ending 30 Sep 2026 */
export function anitaDryDaySeries() {
  const rows: Array<{ date: string; rainfall: number }> = [];
  const start = new Date("2026-09-10T00:00:00+05:30");
  for (let i = 0; i < 21; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    rows.push({ date: d.toISOString(), rainfall: i === 20 ? 4 : 2 });
  }
  return rows;
}

/** Latur season rainfall totaling 48 mm across policy window samples */
export function rameshRainfallSeries() {
  return [
    { date: "2026-06-15T00:00:00+05:30", rainfall: 12 },
    { date: "2026-07-15T00:00:00+05:30", rainfall: 18 },
    { date: "2026-08-15T00:00:00+05:30", rainfall: 10 },
    { date: "2026-09-15T00:00:00+05:30", rainfall: 8 },
  ];
}

export const claimNumbers = {
  rameshSettled: "CR-2026-1104",
  rameshApproved: "CR-2026-1842",
  ibrahimRejected: "CR-2026-2201",
  anitaParametric: "CR-2026-4419",
} as const;

export const fixtures = {
  whatsappText: {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "+910000000000", phone_number_id: "PNID" },
          contacts: [{ profile: { name: "Meera" }, wa_id: "919800000005" }],
          messages: [{
            from: "919800000005",
            id: "wamid.FIXTURE_TEXT_MEERA_01",
            timestamp: "1772960000",
            type: "text",
            text: { body: "Hi" },
          }],
        },
        field: "messages",
      }],
    }],
  },
  whatsappAudio: {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "+910000000000", phone_number_id: "PNID" },
          contacts: [{ profile: { name: "Ramesh Patil" }, wa_id: "919800000001" }],
          messages: [{
            from: "919800000001",
            id: "wamid.FIXTURE_AUDIO_RAMESH_01",
            timestamp: "1772960000",
            type: "audio",
            audio: { id: "MEDIA_ID_AUDIO_01", mime_type: "audio/ogg; codecs=opus" },
          }],
        },
        field: "messages",
      }],
    }],
  },
  locationInside: { lat: 18.4089, lng: 76.5605 }, // ~15m from Ramesh parcel
  locationOutside: { lat: 18.4145, lng: 76.5604 }, // ~630m north
};

export const DEV_OTP = "111111";
