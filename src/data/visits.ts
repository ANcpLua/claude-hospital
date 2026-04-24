export interface Visit {
  readonly id: string;
  readonly date: string;
  readonly doctor: string;
  readonly diagnosis: string;
  readonly recommendations: ReadonlyArray<string>;
  readonly termsToExplain: ReadonlyArray<{ readonly term: string; readonly lay: string }>;
}

export const VISITS: ReadonlyArray<Visit> = [
  {
    id: "v-2026-04-10",
    date: "2026-04-10",
    doctor: "Dr. Anthropic · Cardiology",
    diagnosis: "Stable angina · medication-managed",
    recommendations: [
      "Continue aspirin 81 mg daily.",
      "Continue atorvastatin 40 mg in the evening.",
      "Start amlodipine 5 mg once daily.",
      "Mediterranean diet — fruit, vegetables, olive oil, fish twice a week.",
      "Walk 30 minutes a day, five days a week.",
      "Return in 3 months for a repeat lipid panel.",
    ],
    termsToExplain: [
      {
        term: "Stable angina",
        lay: "Chest discomfort that comes with exertion and goes away with rest.",
      },
      {
        term: "Mediterranean diet",
        lay: "A way of eating focused on plants, olive oil, and fish — low on red meat and processed food.",
      },
      {
        term: "Lipid panel",
        lay: "A blood test measuring cholesterol and fats.",
      },
    ],
  },
  {
    id: "v-2026-01-15",
    date: "2026-01-15",
    doctor: "Dr. Anthropic · Cardiology",
    diagnosis: "Hypertension · uncontrolled at this visit",
    recommendations: [
      "Increase ramipril to 10 mg once daily.",
      "Reduce sodium to under 2 g per day — read labels.",
      "Home BP log: morning and evening for 4 weeks, bring readings.",
      "Repeat basic metabolic panel in 4 weeks.",
      "Return in 6 weeks to reassess.",
    ],
    termsToExplain: [
      {
        term: "Ramipril",
        lay: "A blood-pressure medication that relaxes blood vessels.",
      },
      {
        term: "Basic metabolic panel",
        lay: "A blood test that checks kidney function, salts, and sugar.",
      },
    ],
  },
  {
    id: "v-2025-09-22",
    date: "2025-09-22",
    doctor: "Dr. Anthropic · Cardiology",
    diagnosis: "Annual cardiac check-up · low overall risk",
    recommendations: [
      "Continue current medications without changes.",
      "Maintain a Mediterranean-style diet.",
      "Aim for 150 minutes of moderate activity weekly.",
      "Annual lipid panel and ECG next year.",
      "Return in 12 months unless symptoms change.",
    ],
    termsToExplain: [
      {
        term: "ECG",
        lay: "A 10-second recording of the heart's electrical signal — painless, with stickers on your chest.",
      },
    ],
  },
];
