import type { Case, Task, AuditEntry } from '../types'

// Helper: days ago as ISO string
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function hoursAgo(n: number): string {
  const d = new Date()
  d.setHours(d.getHours() - n)
  return d.toISOString()
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function daysAgoDate(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── Cases ───────────────────────────────────────────────────────────────────

export const INITIAL_CASES: Case[] = [
  // INTAKE
  {
    id: 'case-001',
    caseNumber: 'LIT-2024-001',
    title: 'Henderson v. Meridian Corp.',
    client: 'Robert Henderson',
    owner: 'Sarah Chen',
    stage: 'intake',
    stepId: 'client_contact',
    subStepId: 'engagement_letter',
    stageEnteredAt: daysAgo(2),
    lastActivity: hoursAgo(3),
    tags: ['personal-injury', 'corporate'],
  },
  {
    id: 'case-002',
    caseNumber: 'EST-2024-014',
    title: 'Patel Estate Dispute',
    client: 'Anita Patel',
    owner: 'James Okafor',
    stage: 'intake',
    stepId: 'doc_collection',
    subStepId: 'id_verification',
    stageEnteredAt: daysAgo(5),
    lastActivity: daysAgo(1),
    tags: ['estate', 'probate'],
  },

  // ASSESSMENT
  {
    id: 'case-003',
    caseNumber: 'EMP-2024-022',
    title: 'Williams Wrongful Termination',
    client: 'Marcus Williams',
    owner: 'Sarah Chen',
    stage: 'assessment',
    stepId: 'case_review',
    subStepId: 'legal_research',
    stageEnteredAt: daysAgo(8),
    lastActivity: hoursAgo(6),
    tags: ['employment', 'wrongful-termination'],
  },
  {
    id: 'case-004',
    caseNumber: 'COM-2024-007',
    title: 'TechVenture IP Dispute',
    client: 'TechVenture LLC',
    owner: 'Rachel Torres',
    stage: 'assessment',
    stepId: 'strategy',
    subStepId: 'strategy_memo',
    stageEnteredAt: daysAgo(11),
    lastActivity: daysAgo(3),
    tags: ['IP', 'commercial'],
  },

  // DISCOVERY
  {
    id: 'case-005',
    caseNumber: 'LIT-2023-089',
    title: 'Nguyen v. City of Westfield',
    client: 'Lisa Nguyen',
    owner: 'James Okafor',
    stage: 'discovery',
    stepId: 'depositions',
    subStepId: 'conduct_depositions',
    stageEnteredAt: daysAgo(22),
    lastActivity: hoursAgo(12),
    tags: ['civil-rights', 'government'],
  },
  {
    id: 'case-006',
    caseNumber: 'COM-2023-112',
    title: 'Brookfield Contract Breach',
    client: 'Brookfield Partners',
    owner: 'Rachel Torres',
    stage: 'discovery',
    stepId: 'document_production',
    subStepId: 'review_produced',
    stageEnteredAt: daysAgo(31),
    lastActivity: daysAgo(5),
    tags: ['commercial', 'contract'],
  },

  // NEGOTIATION
  {
    id: 'case-007',
    caseNumber: 'PI-2023-045',
    title: 'Torres Auto Accident',
    client: 'Carlos Torres',
    owner: 'Sarah Chen',
    stage: 'negotiation',
    stepId: 'settlement_talks',
    subStepId: 'counter_offer',
    stageEnteredAt: daysAgo(9),
    lastActivity: hoursAgo(2),
    tags: ['personal-injury', 'auto'],
  },
  {
    id: 'case-008',
    caseNumber: 'MED-2023-033',
    title: 'Kim Divorce Settlement',
    client: 'Jennifer Kim',
    owner: 'James Okafor',
    stage: 'negotiation',
    stepId: 'settlement_talks',
    subStepId: 'mediation',
    stageEnteredAt: daysAgo(18),
    lastActivity: daysAgo(2),
    tags: ['family', 'divorce'],
  },

  // LITIGATION
  {
    id: 'case-009',
    caseNumber: 'LIT-2023-056',
    title: 'O\'Brien v. Hartwell Insurance',
    client: 'Patrick O\'Brien',
    owner: 'Rachel Torres',
    stage: 'litigation',
    stepId: 'motions',
    subStepId: 'summary_judgment',
    stageEnteredAt: daysAgo(45),
    lastActivity: hoursAgo(8),
    tags: ['insurance', 'bad-faith'],
  },
  {
    id: 'case-010',
    caseNumber: 'LIT-2022-201',
    title: 'Riverside Development Fraud',
    client: 'Riverside HOA',
    owner: 'Sarah Chen',
    stage: 'litigation',
    stepId: 'trial',
    subStepId: 'trial_prep',
    stageEnteredAt: daysAgo(62),
    lastActivity: daysAgo(1),
    tags: ['fraud', 'real-estate'],
  },

  // RESOLUTION
  {
    id: 'case-011',
    caseNumber: 'PI-2022-178',
    title: 'Alvarez Slip & Fall',
    client: 'Maria Alvarez',
    owner: 'James Okafor',
    stage: 'resolution',
    stepId: 'settlement_execution',
    subStepId: 'sign_agreement',
    stageEnteredAt: daysAgo(4),
    lastActivity: hoursAgo(5),
    tags: ['personal-injury', 'premises'],
  },

  // CLOSED
  {
    id: 'case-012',
    caseNumber: 'EMP-2022-099',
    title: 'Garcia Discrimination Suit',
    client: 'Elena Garcia',
    owner: 'Rachel Torres',
    stage: 'closed',
    stepId: 'file_closure',
    subStepId: 'archive',
    stageEnteredAt: daysAgo(1),
    lastActivity: hoursAgo(18),
    tags: ['employment', 'discrimination'],
  },
]

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const INITIAL_TASKS: Task[] = [
  // case-001 tasks
  { id: 'task-001', caseId: 'case-001', title: 'Send engagement letter to client', status: 'in_progress', assignee: 'Sarah Chen', dueDate: daysFromNow(1), priority: 'high', notes: 'Client requested e-signature version.', createdAt: daysAgo(2), updatedAt: hoursAgo(3) },
  { id: 'task-002', caseId: 'case-001', title: 'Complete conflict of interest check', status: 'done', assignee: 'Sarah Chen', dueDate: daysFromNow(0), priority: 'urgent', notes: 'Checked Martindale database.', createdAt: daysAgo(2), updatedAt: daysAgo(1) },
  { id: 'task-003', caseId: 'case-001', title: 'Request initial case documents', status: 'backlog', assignee: 'Sarah Chen', dueDate: daysFromNow(3), priority: 'medium', notes: '', createdAt: daysAgo(1), updatedAt: daysAgo(1) },

  // case-002 tasks
  { id: 'task-004', caseId: 'case-002', title: 'Verify client identity documents', status: 'in_progress', assignee: 'James Okafor', dueDate: daysAgoDate(1), priority: 'high', notes: 'Passport copy received, awaiting utility bill.', createdAt: daysAgo(5), updatedAt: hoursAgo(6) },
  { id: 'task-005', caseId: 'case-002', title: 'Draft retainer agreement', status: 'review', assignee: 'James Okafor', dueDate: daysAgoDate(2), priority: 'urgent', notes: 'Needs partner sign-off before sending.', createdAt: daysAgo(5), updatedAt: daysAgo(2) },
  { id: 'task-006', caseId: 'case-002', title: 'Obtain probate court records', status: 'backlog', assignee: 'James Okafor', dueDate: daysFromNow(5), priority: 'medium', notes: '', createdAt: daysAgo(4), updatedAt: daysAgo(4) },

  // case-003 tasks
  { id: 'task-007', caseId: 'case-003', title: 'Research WARN Act applicability', status: 'in_progress', assignee: 'Sarah Chen', dueDate: daysFromNow(2), priority: 'high', notes: 'Focus on state-level protections.', createdAt: daysAgo(8), updatedAt: hoursAgo(6) },
  { id: 'task-008', caseId: 'case-003', title: 'Collect employment records', status: 'waiting', assignee: 'Sarah Chen', dueDate: daysAgoDate(3), priority: 'urgent', notes: 'Waiting on HR records from opposing counsel.', createdAt: daysAgo(7), updatedAt: daysAgo(3) },
  { id: 'task-009', caseId: 'case-003', title: 'Interview two additional witnesses', status: 'backlog', assignee: 'Sarah Chen', dueDate: daysFromNow(7), priority: 'medium', notes: '', createdAt: daysAgo(5), updatedAt: daysAgo(5) },

  // case-004 tasks
  { id: 'task-010', caseId: 'case-004', title: 'Draft IP strategy memo', status: 'review', assignee: 'Rachel Torres', dueDate: daysAgoDate(1), priority: 'high', notes: 'Pending partner review.', createdAt: daysAgo(11), updatedAt: daysAgo(3) },
  { id: 'task-011', caseId: 'case-004', title: 'Patent search — competitor filings', status: 'done', assignee: 'Rachel Torres', dueDate: daysAgoDate(5), priority: 'high', notes: 'Complete. 3 conflicting patents identified.', createdAt: daysAgo(10), updatedAt: daysAgo(5) },

  // case-005 tasks
  { id: 'task-012', caseId: 'case-005', title: 'Conduct deposition of Chief Wilson', status: 'in_progress', assignee: 'James Okafor', dueDate: daysFromNow(1), priority: 'urgent', notes: 'Scheduled for tomorrow 10am.', createdAt: daysAgo(7), updatedAt: hoursAgo(12) },
  { id: 'task-013', caseId: 'case-005', title: 'Review deposition transcripts (Sgt. Moore)', status: 'review', assignee: 'James Okafor', dueDate: daysAgoDate(2), priority: 'high', notes: 'Transcript received from court reporter.', createdAt: daysAgo(10), updatedAt: daysAgo(2) },
  { id: 'task-014', caseId: 'case-005', title: 'File motion to compel additional documents', status: 'blocked', assignee: 'James Okafor', dueDate: daysAgoDate(5), priority: 'urgent', notes: 'Need senior partner approval before filing.', createdAt: daysAgo(14), updatedAt: daysAgo(5) },

  // case-006 tasks
  { id: 'task-015', caseId: 'case-006', title: 'Review 2,400 produced documents', status: 'in_progress', assignee: 'Rachel Torres', dueDate: daysAgoDate(3), priority: 'high', notes: 'Using Relativity. 60% complete.', createdAt: daysAgo(14), updatedAt: daysAgo(5) },
  { id: 'task-016', caseId: 'case-006', title: 'Prepare privilege log', status: 'backlog', assignee: 'Rachel Torres', dueDate: daysFromNow(10), priority: 'medium', notes: '', createdAt: daysAgo(10), updatedAt: daysAgo(10) },
  { id: 'task-017', caseId: 'case-006', title: 'Second request for production', status: 'blocked', assignee: 'Rachel Torres', dueDate: daysAgoDate(8), priority: 'urgent', notes: 'Opposing counsel missed deadline. Court order needed.', createdAt: daysAgo(20), updatedAt: daysAgo(8) },

  // case-007 tasks
  { id: 'task-018', caseId: 'case-007', title: 'Respond to counter-offer ($225k)', status: 'in_progress', assignee: 'Sarah Chen', dueDate: daysFromNow(1), priority: 'urgent', notes: 'Client approved counter at $280k.', createdAt: daysAgo(3), updatedAt: hoursAgo(2) },
  { id: 'task-019', caseId: 'case-007', title: 'Obtain updated medical records', status: 'done', assignee: 'Sarah Chen', dueDate: daysAgoDate(4), priority: 'high', notes: '', createdAt: daysAgo(9), updatedAt: daysAgo(4) },

  // case-008 tasks
  { id: 'task-020', caseId: 'case-008', title: 'Prepare mediation brief', status: 'review', assignee: 'James Okafor', dueDate: daysAgoDate(3), priority: 'high', notes: 'Mediator requires submission 72h before session.', createdAt: daysAgo(10), updatedAt: daysAgo(3) },
  { id: 'task-021', caseId: 'case-008', title: 'Asset valuation analysis', status: 'waiting', assignee: 'James Okafor', dueDate: daysAgoDate(6), priority: 'high', notes: 'Waiting on financial expert report.', createdAt: daysAgo(14), updatedAt: daysAgo(6) },
  { id: 'task-022', caseId: 'case-008', title: 'Mediation session attendance', status: 'backlog', assignee: 'James Okafor', dueDate: daysFromNow(4), priority: 'urgent', notes: 'Schedule confirmed for next week.', createdAt: daysAgo(7), updatedAt: daysAgo(7) },

  // case-009 tasks
  { id: 'task-023', caseId: 'case-009', title: 'File summary judgment motion', status: 'in_progress', assignee: 'Rachel Torres', dueDate: daysFromNow(3), priority: 'urgent', notes: 'Court deadline is firm.', createdAt: daysAgo(10), updatedAt: hoursAgo(8) },
  { id: 'task-024', caseId: 'case-009', title: 'Draft supporting memorandum of law', status: 'review', assignee: 'Rachel Torres', dueDate: daysFromNow(2), priority: 'urgent', notes: 'First draft complete, needs cite-checking.', createdAt: daysAgo(8), updatedAt: daysAgo(1) },
  { id: 'task-025', caseId: 'case-009', title: 'Compile exhibit binder', status: 'in_progress', assignee: 'Rachel Torres', dueDate: daysFromNow(2), priority: 'high', notes: '42 exhibits indexed.', createdAt: daysAgo(5), updatedAt: hoursAgo(8) },

  // case-010 tasks
  { id: 'task-026', caseId: 'case-010', title: 'Witness preparation sessions', status: 'in_progress', assignee: 'Sarah Chen', dueDate: daysAgoDate(1), priority: 'urgent', notes: '3 of 5 witnesses prepped.', createdAt: daysAgo(14), updatedAt: daysAgo(1) },
  { id: 'task-027', caseId: 'case-010', title: 'Finalize trial exhibit list', status: 'blocked', assignee: 'Sarah Chen', dueDate: daysAgoDate(4), priority: 'urgent', notes: 'Waiting on ruling from judge on admissibility.', createdAt: daysAgo(20), updatedAt: daysAgo(4) },
  { id: 'task-028', caseId: 'case-010', title: 'Prepare opening statement', status: 'in_progress', assignee: 'Sarah Chen', dueDate: daysFromNow(2), priority: 'high', notes: '', createdAt: daysAgo(10), updatedAt: daysAgo(1) },
  { id: 'task-029', caseId: 'case-010', title: 'Expert witness coordination', status: 'waiting', assignee: 'Sarah Chen', dueDate: daysAgoDate(2), priority: 'high', notes: 'Expert confirmed availability.', createdAt: daysAgo(15), updatedAt: daysAgo(2) },

  // case-011 tasks
  { id: 'task-030', caseId: 'case-011', title: 'Execute settlement agreement', status: 'in_progress', assignee: 'James Okafor', dueDate: daysFromNow(1), priority: 'high', notes: 'Both parties ready to sign.', createdAt: daysAgo(4), updatedAt: hoursAgo(5) },
  { id: 'task-031', caseId: 'case-011', title: 'Confirm wire transfer details', status: 'backlog', assignee: 'James Okafor', dueDate: daysFromNow(3), priority: 'medium', notes: '', createdAt: daysAgo(3), updatedAt: daysAgo(3) },

  // case-012 tasks
  { id: 'task-032', caseId: 'case-012', title: 'Prepare final invoice', status: 'done', assignee: 'Rachel Torres', dueDate: daysAgoDate(3), priority: 'medium', notes: '', createdAt: daysAgo(7), updatedAt: daysAgo(3) },
  { id: 'task-033', caseId: 'case-012', title: 'Archive case files', status: 'in_progress', assignee: 'Rachel Torres', dueDate: daysFromNow(1), priority: 'low', notes: 'Scanning physical documents.', createdAt: daysAgo(2), updatedAt: hoursAgo(18) },
]

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: 'audit-001',
    caseId: 'case-005',
    type: 'stage_skip',
    fromStage: 'assessment',
    toStage: 'discovery',
    reason: 'Client provided sufficient documentation during intake to bypass standard assessment phase. Senior partner approved expedited processing.',
    actor: 'James Okafor',
    timestamp: daysAgo(22),
    description: 'Skipped Assessment → moved to Discovery',
  },
  {
    id: 'audit-002',
    caseId: 'case-006',
    type: 'stage_change',
    fromStage: 'assessment',
    toStage: 'discovery',
    actor: 'Rachel Torres',
    timestamp: daysAgo(31),
    description: 'Assessment complete — entered Discovery',
  },
  {
    id: 'audit-003',
    caseId: 'case-012',
    type: 'stage_change',
    fromStage: 'resolution',
    toStage: 'closed',
    actor: 'Rachel Torres',
    timestamp: daysAgo(1),
    description: 'Case closed following successful resolution',
  },
]
