import type { CaseStage } from '../types'

export const STAGES: CaseStage[] = [
  {
    id: 'intake',
    label: 'Intake',
    color: 'bg-violet-500',
    textColor: 'text-violet-400',
    accentBorder: 'border-violet-500',
    accentBg: 'bg-violet-500/10',
    stuckThresholdDays: 3,
    criticalThresholdDays: 7,
    steps: [
      {
        id: 'client_contact',
        label: 'Client Contact',
        subSteps: [
          { id: 'initial_call', label: 'Initial Call' },
          { id: 'conflict_check', label: 'Conflict Check' },
          { id: 'engagement_letter', label: 'Engagement Letter' },
        ],
      },
      {
        id: 'doc_collection',
        label: 'Document Collection',
        subSteps: [
          { id: 'id_verification', label: 'ID Verification' },
          { id: 'retainer_signed', label: 'Retainer Signed' },
          { id: 'initial_docs', label: 'Initial Documents' },
        ],
      },
    ],
  },
  {
    id: 'assessment',
    label: 'Assessment',
    color: 'bg-blue-500',
    textColor: 'text-blue-400',
    accentBorder: 'border-blue-500',
    accentBg: 'bg-blue-500/10',
    stuckThresholdDays: 7,
    criticalThresholdDays: 14,
    steps: [
      {
        id: 'case_review',
        label: 'Case Review',
        subSteps: [
          { id: 'facts_analysis', label: 'Facts Analysis' },
          { id: 'legal_research', label: 'Legal Research' },
          { id: 'liability_assessment', label: 'Liability Assessment' },
        ],
      },
      {
        id: 'strategy',
        label: 'Strategy Development',
        subSteps: [
          { id: 'strategy_memo', label: 'Strategy Memo' },
          { id: 'client_briefing', label: 'Client Briefing' },
        ],
      },
    ],
  },
  {
    id: 'discovery',
    label: 'Discovery',
    color: 'bg-cyan-500',
    textColor: 'text-cyan-400',
    accentBorder: 'border-cyan-500',
    accentBg: 'bg-cyan-500/10',
    stuckThresholdDays: 14,
    criticalThresholdDays: 30,
    steps: [
      {
        id: 'interrogatories',
        label: 'Interrogatories',
        subSteps: [
          { id: 'draft_interrogatories', label: 'Draft Interrogatories' },
          { id: 'serve_interrogatories', label: 'Serve' },
          { id: 'review_responses', label: 'Review Responses' },
        ],
      },
      {
        id: 'depositions',
        label: 'Depositions',
        subSteps: [
          { id: 'schedule_depositions', label: 'Schedule' },
          { id: 'conduct_depositions', label: 'Conduct' },
          { id: 'review_transcripts', label: 'Review Transcripts' },
        ],
      },
      {
        id: 'document_production',
        label: 'Document Production',
        subSteps: [
          { id: 'request_docs', label: 'Request Docs' },
          { id: 'review_produced', label: 'Review Produced' },
          { id: 'privilege_log', label: 'Privilege Log' },
        ],
      },
    ],
  },
  {
    id: 'negotiation',
    label: 'Negotiation',
    color: 'bg-amber-500',
    textColor: 'text-amber-400',
    accentBorder: 'border-amber-500',
    accentBg: 'bg-amber-500/10',
    stuckThresholdDays: 10,
    criticalThresholdDays: 21,
    steps: [
      {
        id: 'demand_letter',
        label: 'Demand Letter',
        subSteps: [
          { id: 'draft_demand', label: 'Draft Demand' },
          { id: 'client_approval', label: 'Client Approval' },
          { id: 'send_demand', label: 'Send Demand' },
        ],
      },
      {
        id: 'settlement_talks',
        label: 'Settlement Talks',
        subSteps: [
          { id: 'initial_offer', label: 'Initial Offer' },
          { id: 'counter_offer', label: 'Counter Offer' },
          { id: 'mediation', label: 'Mediation' },
        ],
      },
    ],
  },
  {
    id: 'litigation',
    label: 'Litigation',
    color: 'bg-red-500',
    textColor: 'text-red-400',
    accentBorder: 'border-red-500',
    accentBg: 'bg-red-500/10',
    stuckThresholdDays: 21,
    criticalThresholdDays: 60,
    steps: [
      {
        id: 'filing',
        label: 'Filing',
        subSteps: [
          { id: 'draft_complaint', label: 'Draft Complaint' },
          { id: 'file_complaint', label: 'File Complaint' },
          { id: 'serve_defendant', label: 'Serve Defendant' },
        ],
      },
      {
        id: 'motions',
        label: 'Motions',
        subSteps: [
          { id: 'motion_to_dismiss', label: 'Motion to Dismiss' },
          { id: 'summary_judgment', label: 'Summary Judgment' },
          { id: 'pretrial_motions', label: 'Pretrial Motions' },
        ],
      },
      {
        id: 'trial',
        label: 'Trial',
        subSteps: [
          { id: 'trial_prep', label: 'Trial Prep' },
          { id: 'jury_selection', label: 'Jury Selection' },
          { id: 'verdict', label: 'Verdict' },
        ],
      },
    ],
  },
  {
    id: 'resolution',
    label: 'Resolution',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    accentBorder: 'border-emerald-500',
    accentBg: 'bg-emerald-500/10',
    stuckThresholdDays: 7,
    criticalThresholdDays: 14,
    steps: [
      {
        id: 'settlement_execution',
        label: 'Settlement Execution',
        subSteps: [
          { id: 'draft_agreement', label: 'Draft Agreement' },
          { id: 'sign_agreement', label: 'Sign Agreement' },
          { id: 'payment', label: 'Payment' },
        ],
      },
      {
        id: 'court_order',
        label: 'Court Order',
        subSteps: [
          { id: 'submit_order', label: 'Submit Order' },
          { id: 'enter_judgment', label: 'Enter Judgment' },
        ],
      },
    ],
  },
  {
    id: 'closed',
    label: 'Closed',
    color: 'bg-gray-500',
    textColor: 'text-gray-400',
    accentBorder: 'border-gray-600',
    accentBg: 'bg-gray-500/8',
    stuckThresholdDays: 999,
    criticalThresholdDays: 999,
    steps: [
      {
        id: 'file_closure',
        label: 'File Closure',
        subSteps: [
          { id: 'final_billing', label: 'Final Billing' },
          { id: 'return_docs', label: 'Return Documents' },
          { id: 'archive', label: 'Archive' },
        ],
      },
    ],
  },
]

export const STAGE_MAP = new Map(STAGES.map((s) => [s.id, s]))
