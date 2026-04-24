export type Profile = "california" | "saudi" | "germany";

export const PROFILE_LABELS: Record<Profile, string> = {
  california: "California",
  saudi: "Saudi Arabia",
  germany: "Germany (U1)",
};

export const SCREENINGS: Record<Profile, ReadonlyArray<string>> = {
  california: [
    "Newborn metabolic screen (61 conditions per CA panel)",
    "Critical congenital heart disease (pulse ox)",
    "Hearing screen (OAE / AABR)",
    "Bilirubin — transcutaneous",
    "Hepatitis B vaccine, dose 1",
  ],
  saudi: [
    "Newborn metabolic screen (KSA expanded panel, 16+ IEMs)",
    "G6PD deficiency — quantitative",
    "Congenital hypothyroidism (TSH, neonatal)",
    "Congenital adrenal hyperplasia (17-OHP)",
    "Hemoglobinopathy screen (α/β-thalassaemia, HbS)",
    "Critical congenital heart disease (pulse ox)",
    "Hearing screen (OAE / AABR)",
    "Bilirubin — transcutaneous",
    "Hepatitis B vaccine, dose 1",
  ],
  germany: [
    "Vitamin K prophylaxis (oral, day-of-life 1)",
    "Hip ultrasound (referred to U2/U3 follow-up)",
    "Hearing screen (OAE)",
    "Pulse oximetry for critical congenital heart disease",
    "Newborn metabolic screen (14 conditions per German panel)",
  ],
};
