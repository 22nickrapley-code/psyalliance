/* Titles and summaries from the owner's supplied starter-set manifest.
   Source PDFs are preserved unchanged. No professional approval is asserted. */
(() => {
 const entries=[
 [1,'Reciprocal-Coverage-Agreement','Reciprocal Coverage Agreement','Cover & continuity','A reciprocal coverage agreement, coverage summary and post-coverage debrief.'],
 [2,'Extended-Leave-Coverage-and-Handoff-Pack','Extended Leave Coverage & Handoff Pack','Cover & continuity','A leave plan, clinical handoff pack and letter templates.'],
 [3,'Professional-Will-and-Succession-Plan','Professional Will & Succession Plan','Cover & continuity','A professional will template, continuity inventory and executor acceptance.'],
 [4,'Peer-Consultation-Group-Charter','Peer Consultation Group Charter','Consultation','A charter, member agreement, meeting agenda and consultation log.'],
 [5,'Case-Consultation-Presentation-Template','Case Consultation Presentation Template','Consultation','A de-identified presentation form, checklist and consultation response sheet.'],
 [6,'Clinical-Supervision-Agreement-and-Log','Clinical Supervision Agreement & Log','Consultation','An agreement, session log and quarterly evaluation form.'],
 [7,'Referral-Termination-and-Transfer-of-Care-Toolkit','Referral & Transfer-of-Care Toolkit','Referrals','Referral and close-the-loop letters, termination templates and discharge summary.'],
 [8,'Split-Treatment-Collaboration-Agreement','Split-Treatment Collaboration Agreement','Consultation','A prescriber–therapist agreement, patient acknowledgment and communication log.'],
 [9,'Informed-Consent-for-Psychotherapy','Informed Consent for Psychotherapy','Practice essentials','An adult consent template, optional modules and customisation checklist.'],
 [10,'Telepsychology-Consent-and-Multi-State-Checklist','Telepsychology & Multi-State Checklist','Practice essentials','A consent addendum, location check and multi-state practice checklist.'],
 [11,'AI-Scribe-and-AI-Tools-Consent-Vetting-and-Policy','AI Tools: Consent, Vetting & Policy','Practice essentials','Consent, vendor due-diligence and practice-policy templates.'],
 [12,'Clinical-Documentation-Pack','Clinical Documentation Pack','Practice essentials','Intake, treatment plan and progress-note templates with quality checklist.'],
 [13,'Suicide-Risk-Safety-Planning-and-Follow-Up-Pack','Risk, Safety Planning & Follow-Up Pack','Practice essentials','Risk formulation, safety planning, follow-up and state review worksheets.'],
 [14,'Telepsychiatry-and-Controlled-Substance-Compliance-Kit','Telepsychiatry & Prescribing Compliance Kit','Practice essentials','Prescribing, documentation and contingency-plan templates.'],
 [15,'Financial-Policy-Good-Faith-Estimate-and-Superbill-Pack','Financial Policy, Estimate & Superbill Pack','Practice essentials','Financial-policy, Good Faith Estimate and superbill templates.'],
 [16,'Group-Practice-Clinician-Agreement-Builder','Group Practice Agreement & Onboarding Kit','Practice essentials','A term sheet, agreement guide and clinician onboarding checklist.'],
 [17,'Privacy-Notice-and-Release-of-Information-Pack','Privacy Notice & Release of Information','Practice essentials','Privacy notices, authorisation forms and records-request letters.'],
 [18,'HIPAA-Security-Risk-Analysis-and-Breach-Response-Kit','Security Risk & Breach Response Kit','Practice essentials','Security worksheets, safeguards, incident log and response guide.'],
 [19,'Practice-Compliance-Calendar-and-Renewal-Tracker','Compliance Calendar & Renewal Tracker','Practice essentials','A renewal tracker, annual calendar and quarterly review agenda.'],
 [20,'Subpoena-Court-Order-and-Records-Request-Response-Guide','Legal Requests: A Response Guide','Practice essentials','Legal-request intake logs, decision tables and response letter templates.']
 ];
 window.PA_DATA.resources.push(...entries.map(([n,file,title,category,description])=>({id:100+n,title,category,description,type:'PDF template',supplied:true,pdf:`assets/library/PA-${String(n).padStart(2,'0')}_${file}.pdf`,sections:[['What’s inside',description],['Review status','Supplied draft template. Professional and jurisdiction-specific review is pending. Adapt it with the appropriate professional advice before use.']]})));
})();
