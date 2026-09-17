-- Seed dropdown values for profile_lookup_values.
-- Starter list covering common categories - Nick/Rena should review and refine
-- against the original spec's full "Dropdown Lists" sheet; this unblocks UI
-- development without waiting on that pass.

insert into lookup_values (category, value) values
  ('treatment_specialism', 'Anxiety'),
  ('treatment_specialism', 'Depression'),
  ('treatment_specialism', 'Trauma / PTSD'),
  ('treatment_specialism', 'Grief and loss'),
  ('treatment_specialism', 'Couples / relationship issues'),
  ('treatment_specialism', 'Child and adolescent'),
  ('treatment_specialism', 'ADHD'),
  ('treatment_specialism', 'Substance use / addiction'),
  ('treatment_specialism', 'Eating disorders'),
  ('treatment_specialism', 'OCD'),
  ('treatment_specialism', 'Bipolar disorder'),
  ('treatment_specialism', 'Personality disorders'),
  ('treatment_specialism', 'Autism spectrum'),
  ('treatment_specialism', 'LGBTQ+ affirming care'),
  ('treatment_specialism', 'Career / life transitions'),
  ('treatment_specialism', 'Chronic illness / pain'),
  ('treatment_specialism', 'Perinatal / postpartum'),
  ('treatment_specialism', 'Geriatric / aging'),
  ('treatment_specialism', 'Forensic / court-involved'),
  ('treatment_specialism', 'Sleep disorders'),

  ('treatment_modality', 'Cognitive Behavioral Therapy (CBT)'),
  ('treatment_modality', 'Dialectical Behavior Therapy (DBT)'),
  ('treatment_modality', 'EMDR'),
  ('treatment_modality', 'Psychodynamic therapy'),
  ('treatment_modality', 'Acceptance and Commitment Therapy (ACT)'),
  ('treatment_modality', 'Family systems therapy'),
  ('treatment_modality', 'Play therapy'),
  ('treatment_modality', 'Solution-focused brief therapy'),
  ('treatment_modality', 'Mindfulness-based therapy'),
  ('treatment_modality', 'Psychoanalysis'),
  ('treatment_modality', 'Group therapy'),
  ('treatment_modality', 'Medication management'),

  ('insurance', 'Aetna'),
  ('insurance', 'Blue Cross Blue Shield'),
  ('insurance', 'Cigna'),
  ('insurance', 'UnitedHealthcare'),
  ('insurance', 'Medicare'),
  ('insurance', 'Medicaid'),
  ('insurance', 'Kaiser Permanente'),
  ('insurance', 'Self-pay only / out of network'),

  ('language', 'English'),
  ('language', 'Spanish'),
  ('language', 'Mandarin'),
  ('language', 'French'),
  ('language', 'Portuguese'),
  ('language', 'Arabic'),
  ('language', 'Hindi'),
  ('language', 'Vietnamese'),
  ('language', 'ASL'),

  ('session_type', 'In-person'),
  ('session_type', 'Virtual')
on conflict (category, value) do nothing;
