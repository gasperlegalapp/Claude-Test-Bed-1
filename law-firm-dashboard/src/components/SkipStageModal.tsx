import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { STAGE_MAP } from '../data/stages'

export function SkipStageModal() {
  const { skipModal, closeSkipModal, confirmSkip, cases } = useStore()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!skipModal.open || !skipModal.caseId || !skipModal.targetStage) return null

  const c = cases.find((x) => x.id === skipModal.caseId)
  const fromStage = c ? STAGE_MAP.get(c.stage) : null
  const toStage = STAGE_MAP.get(skipModal.targetStage)

  const handleConfirm = () => {
    if (!reason.trim()) {
      setError('A reason is required to skip workflow stages.')
      return
    }
    if (reason.trim().length < 20) {
      setError('Please provide a more detailed reason (at least 20 characters).')
      return
    }
    confirmSkip(reason.trim())
    setReason('')
    setError('')
  }

  const handleClose = () => {
    closeSkipModal()
    setReason('')
    setError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-2 border border-white/10 rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Skip Workflow Stage</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                This action will be recorded in the audit log.
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="btn-ghost p-1">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Case info */}
          {c && (
            <div className="bg-surface-3 rounded-lg p-3 border border-white/5">
              <p className="text-xs text-gray-500 mb-0.5">{c.caseNumber}</p>
              <p className="text-sm font-medium text-gray-200">{c.title}</p>
            </div>
          )}

          {/* Stage transition */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-surface-3 rounded-lg p-2.5 border border-white/5 text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">From Stage</p>
              <p className={`text-sm font-semibold ${fromStage?.textColor ?? 'text-gray-400'}`}>
                {fromStage?.label ?? 'Unknown'}
              </p>
            </div>
            <span className="text-gray-600 text-lg">→</span>
            <div className="flex-1 bg-surface-3 rounded-lg p-2.5 border border-white/5 text-center">
              <p className="text-[10px] text-gray-500 mb-0.5">To Stage</p>
              <p className={`text-sm font-semibold ${toStage?.textColor ?? 'text-gray-400'}`}>
                {toStage?.label ?? 'Unknown'}
              </p>
            </div>
          </div>

          {/* Reason input */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Reason for skipping <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError('') }}
              placeholder="Explain why this stage is being skipped (e.g., client provided sufficient documentation, partner approved expedited process)..."
              rows={4}
              className="w-full bg-surface-3 border border-white/10 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
            />
            {error && (
              <p className="text-xs text-red-400 mt-1">{error}</p>
            )}
            <p className="text-[10px] text-gray-600 mt-1">
              {reason.length} characters
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/5">
          <button onClick={handleClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleConfirm}
            className="btn bg-amber-600 hover:bg-amber-500 text-white"
          >
            Confirm Skip & Log
          </button>
        </div>
      </div>
    </div>
  )
}
