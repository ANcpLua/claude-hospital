export type NoteType =
  | "nursing"
  | "hnp"
  | "ed-physician"
  | "lab"
  | "ob-clinic"
  | "pharmacy"
  | "discharge";

export interface PostpartumNote {
  readonly id: string;
  readonly type: NoteType;
  readonly author: string;
  readonly timestamp: string;
  readonly body: string;
}

export const POSTPARTUM_PATIENT = {
  name: "Sarah Connor",
  dob: "1989-05-13",
  delivered: "2026-04-14 · SVD at 39+2 weeks, uncomplicated",
} as const;

export const POSTPARTUM_NOTES: ReadonlyArray<PostpartumNote> = [
  {
    id: "n01",
    type: "nursing",
    author: "RN · K. Park",
    timestamp: "2026-04-14T13:15:00Z",
    body: "Patient delivered vaginally at 39+2 weeks following 8h labor. APGAR 8/9. Estimated blood loss 350 mL. Second-degree perineal laceration repaired by attending. Placenta delivered intact. Mother transferred to recovery in stable condition; vitals BP 118/72, HR 84, T 37.0 C. Latch attempted within first hour, infant suckling vigorously. Husband at bedside and supportive. Infant boy weight 3320 g, length 51 cm, OFC 35 cm. Will reassess uterine fundus and lochia q15 min for first hour, then per PP protocol.",
  },
  {
    id: "n02",
    type: "hnp",
    author: "OB Resident · Dr. Patel",
    timestamp: "2026-04-14T14:30:00Z",
    body: "Obstetric H&P. 36-year-old G2P2 admitted in active labor at 39+2 weeks. Past obstetric: prior SVD 2022, uncomplicated. Medical: gestational DM diet-controlled this pregnancy, otherwise well. No prior surgeries. NKDA. GBS negative. Hep B surface antigen negative. Family history non-contributory. Social: married, full-time engineer, denies tobacco/alcohol. Admission exam: vitals stable, FHT 140s reassuring, cervix 6 cm/100/-1, SROM 1h post-admit, clear fluid. Plan: spontaneous vaginal delivery anticipated; routine PP care; lactation support; discharge home 24-48h if mother and infant stable.",
  },
  {
    id: "n03",
    type: "nursing",
    author: "RN · K. Park",
    timestamp: "2026-04-14T22:00:00Z",
    body: "PP eve. Fundus firm at U-1, lochia rubra moderate. BP 116/70, HR 80, T 36.9 C. Voided spontaneously 350 mL clear yellow urine. Pain 3/10 perineum, declining ibuprofen 600 mg PO. Breastfeeding q2-3h, latch good per IBCLC consult. Infant feeding well, voided x2, stooled meconium x1. Patient ambulating to bathroom independently. Husband sleeping in chair. No complaints.",
  },
  {
    id: "n04",
    type: "nursing",
    author: "RN · M. Gonzalez (NOC)",
    timestamp: "2026-04-15T06:00:00Z",
    body: "PP day 1 AM. Overnight stable. Fundus firm at U-2, lochia rubra small to moderate, no clots > 1 cm. Vitals: BP 114/68, HR 76, T 36.8 C, afebrile. Voided x3 spontaneously, large clear amounts. Pain 2/10 perineum and afterpains, taking ibuprofen 600 mg q6h scheduled. Breastfeeding established, infant nursing q2-3h with audible swallows. Mother slept in 2-3 hour stretches. Plans for shower this AM. No headache, no calf pain, no chest pain, no SOB.",
  },
  {
    id: "n05",
    type: "lab",
    author: "Lab · CBC routine PP",
    timestamp: "2026-04-15T08:30:00Z",
    body: "Complete Blood Count, PP day 1.\nWBC 11.2 k/uL (ref 4.0-11.0) — mildly elevated, expected post-partum.\nHgb 10.8 g/dL (ref 12.0-16.0) — physiologic dilution / blood loss at delivery.\nHct 32.4 % (ref 36-46).\nPlatelets 248 k/uL (ref 150-450) — within normal limits.\nMCV 88 fL, MCH 30 pg, MCHC 33 g/dL — normocytic.\nDifferential: neutrophils 71%, lymphocytes 21%, monocytes 6%, eosinophils 2%.\nNo bands. No interpretive comment from lab. Provider sign-off pending.",
  },
  {
    id: "n06",
    type: "nursing",
    author: "RN · L. Tran",
    timestamp: "2026-04-15T14:00:00Z",
    body: "PP day 1 PM. Patient up to chair, ambulating to bathroom independently. Showered with assist standing by. Fundus firm 2 cm below umbilicus, lochia rubra small. BP 110/70, HR 78, T 36.9 C. Patient reports breastfeeding going well, no nipple pain. Infant has had 4 wet diapers, 2 stools today. Mother eating regular diet, tolerating well. Pediatrician saw infant: cleared for discharge tomorrow if continued stable. OB on board for AM rounds.",
  },
  {
    id: "n07",
    type: "nursing",
    author: "RN · M. Gonzalez (NOC)",
    timestamp: "2026-04-16T06:00:00Z",
    body: "PP day 2 AM, anticipated discharge today. Vitals stable, BP 112/72, HR 74, T 36.8 C, afebrile throughout admission. Lochia rubra small, fundus firm at U-3. Pain 1/10. Breastfeeding well established. Mother independent with infant care, perineal care reviewed and demonstrated. Discharge teaching started: warning signs reviewed (heavy bleeding > 1 pad/h, fever > 38.0 C, severe headache, leg pain/swelling, foul lochia). Patient verbalized understanding. Husband present.",
  },
  {
    id: "n08",
    type: "pharmacy",
    author: "Pharmacy · J. Reyes, PharmD",
    timestamp: "2026-04-16T10:00:00Z",
    body: "Discharge medication reconciliation. Pre-admission medications: prenatal vitamin daily, no other chronic medications. New scripts on discharge:\n- Ibuprofen 600 mg PO q6h PRN pain x 7 days, # 28 tabs.\n- Acetaminophen 1000 mg PO q6h PRN, # 28 tabs.\n- Docusate 100 mg PO BID PRN constipation, # 30 caps.\n- Continue prenatal vitamin daily.\nNo opioids requested or required. Counseled patient: ibuprofen with food, max 3.2 g/day acetaminophen. All medications compatible with breastfeeding. No drug interactions identified.",
  },
  {
    id: "n09",
    type: "nursing",
    author: "RN · L. Tran",
    timestamp: "2026-04-16T12:30:00Z",
    body: "Discharged to home with husband at 12:15. Final vitals BP 110/68, HR 72, T 36.8 C. Discharge instructions reviewed and copy provided. PP follow-up appointment scheduled with OB clinic in 2 weeks. Lactation support phone line provided. Newborn pediatrician follow-up in 48-72h. Patient verbalized understanding of warning signs. Educational materials given on PP recovery, perineal care, infant care. Stable for discharge.",
  },
  {
    id: "n10",
    type: "nursing",
    author: "RN Triage · J. Beck",
    timestamp: "2026-04-17T09:00:00Z",
    body: "Telephone triage call from patient (PP day 3). Patient reports onset of fever last night, measured 38.4 C at home this AM. Also describes deep pelvic ache, worse with standing, and increasing lower-abdominal tenderness. Lochia is reportedly heavier and 'smells different' than yesterday. No chills reported. Voiding without burning. Infant nursing well at home. Triage nurse advised patient to remain available; will discuss with on-call OB and call back within 30 min.",
  },
  {
    id: "n11",
    type: "ob-clinic",
    author: "OB on-call · Dr. Iverson",
    timestamp: "2026-04-17T09:45:00Z",
    body: "Call-back to patient following RN triage note. Discussed symptoms: PP day 3 fever 38.4 C, increasing pelvic tenderness, malodorous lochia. Concern for endometritis vs early UTI vs perineal wound infection. Recommended in-person evaluation today. Given the off-hours timing and acuity (fever + pain), advised patient to present to ED for assessment, pelvic exam, labs, and likely empiric antibiotic initiation rather than wait for clinic visit. Patient agrees, husband driving. ED notified.",
  },
  {
    id: "n12",
    type: "ed-physician",
    author: "ED Attending · Dr. Reyes",
    timestamp: "2026-04-17T18:30:00Z",
    body: "ED visit #1 — PP day 3. CC: fever, pelvic pain. HPI: 36F G2P2, SVD 04-14, presents with 24h of fevers up to 38.6 C, deep pelvic ache, malodorous lochia. No dysuria. Breastfeeding without issue. Exam: T 38.6 C, HR 102, BP 118/76, RR 16, SpO2 99% RA. Abdomen soft, suprapubic and bilateral lower-quadrant tenderness, no peritoneal signs. Pelvic exam: minimal cervical motion tenderness, lochia foul-smelling but not grossly purulent, no retained tissue palpated, perineal repair intact. Labs: CRP 42, UA mild leuk esterase, WBC pending. Assessment: likely early postpartum endometritis. Plan: empiric oral amoxicillin-clavulanate 875/125 BID x 10 d (ambulatory regimen — patient otherwise well, low-risk profile), hydration, antipyretics, return precautions for worsening fever, rigors, persistent pain.",
  },
  {
    id: "n13",
    type: "lab",
    author: "Lab · ED #1 panel",
    timestamp: "2026-04-17T19:15:00Z",
    body: "ED visit, PP day 3.\nCRP 42 mg/L (ref < 5) — elevated, consistent with acute infection/inflammation.\nUrinalysis: leukocyte esterase trace, nitrites negative, WBC 6-10/hpf, RBC 0-2/hpf, no casts. Mildly suggestive of UTI or contamination.\nUrine culture sent — pending.\nWBC 11.0 k/uL (neutrophils 76%, no bands).\nBeta-hCG: not indicated (recent term delivery).\nNo blood cultures obtained at this visit per ED protocol (afebrile by discharge, well-appearing).",
  },
  {
    id: "n14",
    type: "pharmacy",
    author: "Pharmacy · ED · A. Wei, PharmD",
    timestamp: "2026-04-17T21:00:00Z",
    body: "Medication reconciliation post-ED #1. Adding amoxicillin-clavulanate 875/125 mg PO BID x 10 days, dispensed 20 tabs. Reviewed pre-existing meds (prenatal, ibuprofen, acetaminophen, docusate) — no interactions with amox-clav. Confirmed compatibility with breastfeeding (LactMed L1: usually compatible; small risk of infant GI upset, monitor). Counseled patient on full course completion, food intake to reduce nausea, contact provider if rash, severe diarrhea, or worsening symptoms. Patient confirmed understanding. No reported drug allergies.",
  },
  {
    id: "n15",
    type: "ob-clinic",
    author: "OB Clinic · Dr. Iverson",
    timestamp: "2026-04-19T10:30:00Z",
    body: "PP day 5 follow-up clinic visit (post-ED #1). Patient reports feeling somewhat better since starting amoxicillin-clavulanate two days ago. Subjective fevers resolved per patient (no measured T > 37.5 C since 04-18 AM). Pelvic ache improving but still present. Lochia less malodorous, decreased volume. Breastfeeding continues well. Exam: T 37.2 C, HR 88, BP 116/74. Abdomen mildly tender suprapubic, no rebound. Pelvic exam: lochia minimal, no foul odor today, perineal repair healing. Plan: complete amox-clav course (5 more days), repeat CRP today to assess trend, return immediately for fever > 38.0 C, persistent pain, or systemic symptoms. Patient verbalized understanding.",
  },
  {
    id: "n16",
    type: "lab",
    author: "Lab · OB clinic CRP recheck",
    timestamp: "2026-04-19T11:00:00Z",
    body: "CRP follow-up, PP day 5.\nCRP 68 mg/L (ref < 5) — UP from 42 mg/L on 04-17 despite 48h of empiric oral antibiotic.\nNo other labs ordered at this visit per OB instruction.\nResult flagged to ordering provider. Note: an unfavorable CRP trend on appropriate therapy may suggest treatment failure, resistant organism, or alternative source. Recommend clinical correlation.",
  },
  {
    id: "n17",
    type: "nursing",
    author: "RN Telephone · J. Beck",
    timestamp: "2026-04-21T14:00:00Z",
    body: "PP day 7 follow-up phone call per OB plan. Patient reports she felt 'mostly better' for a couple of days but as of this morning has new chills and a measured T 38.2 C. Pelvic ache returning. Still on amoxicillin-clavulanate (day 4 of 10). Lochia minimal but again with subtle malodor. Breastfeeding well, infant fine. Advised patient to monitor closely and call back today if T > 38.5 C, rigors, or worsening pain — return to ED at any time if unwell. Spoke with Dr. Iverson; plan for in-person reassessment if symptoms persist tomorrow.",
  },
  {
    id: "n18",
    type: "ed-physician",
    author: "ED Attending · Dr. Carrasco",
    timestamp: "2026-04-23T22:30:00Z",
    body: "ED visit #2 — PP day 9. CC: high fever, rigors, pelvic pain. HPI: 36F PP day 9 SVD, on day 6 of amoxicillin-clavulanate for presumed endometritis (started ED #1 04-17). Last 24h with rigors x3, T at home 39.1 C, increasing pelvic and flank discomfort. Some mild dysuria today. Breastfeeding continues. Exam: T 39.1 C, HR 118, BP 102/64, RR 22, SpO2 97% RA. Ill-appearing. Abdomen: suprapubic tenderness, mild left CVA tenderness, no peritoneal signs. Pelvic exam: minimal lochia, no overt purulence, repair intact. Labs ordered (CBC, CMP, CRP, lactate), urinalysis with reflex culture, blood cultures x2 drawn before antibiotics. IV access, 1 L LR bolus. Empiric IV cefepime 2 g started after cultures. OB consulted for admission. Likely treatment failure of oral regimen for resistant uropathogen vs endometritis with associated UTI vs evolving pyelonephritis.",
  },
  {
    id: "n19",
    type: "lab",
    author: "Lab · ED #2 panel",
    timestamp: "2026-04-23T23:15:00Z",
    body: "ED visit #2, PP day 9.\nWBC 14.3 k/uL (ref 4.0-11.0) — leukocytosis.\nDifferential: neutrophils 83%, lymphocytes 11%, monocytes 5%, eosinophils 1%. No bands today.\nHgb 11.4 g/dL, Hct 34 %, platelets 312 k/uL.\nCMP: Na 138, K 3.9, Cl 102, HCO3 22, BUN 14, Cr 0.8, glucose 102, total bilirubin 0.6, AST 18, ALT 22.\nLactate 1.4 mmol/L (ref < 2.0).\nCRP 96 mg/L (ref < 5) — further elevation.\nUrinalysis: leukocyte esterase 3+, nitrites positive, WBC > 50/hpf, many bacteria.\nUrine culture and blood cultures x2 drawn — pending.",
  },
  {
    id: "n20",
    type: "hnp",
    author: "OB Inpatient · Dr. Patel",
    timestamp: "2026-04-24T02:00:00Z",
    body: "Readmission H&P. 36F G2P2 PP day 9 SVD, admitted from ED with sepsis/pyelonephritis vs persistent endometritis after failed outpatient amoxicillin-clavulanate. PMH/PSH/Allergies as prior admit. Currently breastfeeding. Vitals on arrival to floor: T 38.4 C (down from 39.1 in ED post-bolus and antipyretic), HR 96, BP 110/70, RR 18, SpO2 98% RA. Exam unchanged from ED documentation; ill-appearing but stable. Started on IV cefepime 2 g q8h empirically pending cultures. Plan: serial vitals q4h, repeat CBC and CRP in AM, follow culture results closely; ID may be consulted if cultures grow resistant organism; nutrition, lactation support, DVT prophylaxis with mechanical SCDs (avoiding pharmacologic given recent delivery and unclear bleeding risk).",
  },
  {
    id: "n21",
    type: "lab",
    author: "Microbiology · final report",
    timestamp: "2026-04-24T14:00:00Z",
    body: "Microbiology — cultures from ED visit 04-23.\nUrine culture: > 100,000 CFU/mL Escherichia coli.\nBlood cultures x2: NO GROWTH at 24 h, hold for 5 d (final pending).\nSusceptibility panel for E. coli isolate (Vitek 2):\n  Ampicillin: RESISTANT\n  Amoxicillin-clavulanate: RESISTANT\n  Cefazolin: RESISTANT\n  Ceftriaxone: SUSCEPTIBLE (intermediate per CLSI breakpoint)\n  Cefepime: SUSCEPTIBLE\n  TMP-SMX: RESISTANT\n  Nitrofurantoin: SUSCEPTIBLE (urinary tract only)\n  Ciprofloxacin: SUSCEPTIBLE\n  Piperacillin-tazobactam: SUSCEPTIBLE\nESBL screen: NEGATIVE.\nResult phoned to inpatient OB team at 14:10.",
  },
  {
    id: "n22",
    type: "nursing",
    author: "RN · D. Owens (inpatient)",
    timestamp: "2026-04-25T06:00:00Z",
    body: "PP day 11 / inpatient day 2. Overnight afebrile (T max 37.4 C), HR 82, BP 116/72, RR 16, SpO2 99% RA. Tolerating IV cefepime well, no rash, no GI upset. Reports pelvic and flank pain markedly improved since starting IV antibiotic. Voiding without burning. Breastfeeding maintained — pumped overnight, husband bringing in stored milk for infant at home with grandmother. Patient slept 5h continuous, asking when she can go home. Plan reviewed by OB on AM rounds.",
  },
  {
    id: "n23",
    type: "ed-physician",
    author: "ED Attending · Dr. Carrasco",
    timestamp: "2026-04-24T01:30:00Z",
    body: "Brief handoff note from ED to inpatient OB service. Patient as detailed in primary ED note (n18). Stable for floor admission, did not require ICU. Empiric IV cefepime begun in ED at 23:40 after cultures drawn. Hemodynamics improved with 1 L LR bolus and antipyretic. Anticipate de-escalation per culture data. ED follow-up: this is the same patient discharged from this department on 04-17 with oral amox-clav for presumed endometritis — flag for departmental case review of bounce-back per QA process.",
  },
  {
    id: "n24",
    type: "nursing",
    author: "RN · D. Owens (inpatient)",
    timestamp: "2026-04-26T14:00:00Z",
    body: "PP day 12 / inpatient day 3. Patient afebrile > 36 h, vitals stable, ambulating in halls without difficulty. Pain 1/10. Repeat CRP today 38 mg/L (down from 96). Tolerating diet, voiding clear urine without symptoms. Breastfeeding/pumping schedule on track. Patient has met discharge criteria per OB team. Awaiting ID and pharmacy review of step-down oral antibiotic given resistance pattern, then discharge teaching to begin.",
  },
  {
    id: "n25",
    type: "discharge",
    author: "OB Attending · Dr. Iverson",
    timestamp: "2026-04-27T11:00:00Z",
    body: "Discharge summary. 36F G2P2 PP day 13 SVD, readmitted PP day 9 for E. coli urinary tract infection / postpartum endometritis with treatment failure of oral amoxicillin-clavulanate. Admit course: empiric IV cefepime started in ED, continued on the floor; afebrile within 24 h of IV initiation; CRP trended 96 → 38 over 72 h. Cultures: urine grew > 100,000 CFU/mL E. coli resistant to amoxicillin-clavulanate, ampicillin, cefazolin, TMP-SMX; susceptible to cefepime, ciprofloxacin, nitrofurantoin (urinary), piperacillin-tazobactam, ceftriaxone (intermediate). Blood cultures negative at 5 d (final). Plan at discharge: oral ciprofloxacin 500 mg BID x 7 days to complete therapy (susceptibilities support); continue breastfeeding (LactMed compatible at this dose, monitor infant); OB follow-up in 1 week, sooner for any fever, rigors, or worsening symptoms; routine 6-week PP visit otherwise. Patient and husband counseled at length on warning signs and the importance of completing the oral course. Discharged home in stable condition.",
  },
];
