/**
 * CuratorConsole: controls for the skill curation engine.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import styles from './Mind.module.css'

interface CuratorState {
  status: 'active' | 'paused' | 'idle'
  lastRun: string | null
  runs: number
  pendingRun?: boolean
}

interface CuratorConsoleProps {
  t: (key: string) => string
}

/**
 * Curator control panel: status display + run/pause/resume actions.
 * @param props - Translation function.
 */
export function CuratorConsole({ t }: CuratorConsoleProps): ReactNode {
  const [state, setState] = useState<CuratorState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/dsh-mind/curator')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const action = async (path: string, successKey: string) => {
    try {
      const res = await fetch(`/dsh-mind/curator/${path}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setState(d)
      setMsg(t(successKey))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (error) return <div className={styles.error}>{error}</div>
  if (!state) return <p>{t('common.loading')}</p>

  const statusLabel = t(`status.curator_${state.status}`)
  const statusClass =
    state.status === 'active'
      ? styles.statusActive
      : state.status === 'paused'
        ? styles.statusPaused
        : styles.statusIdle

  return (
    <div>
      <h3>{t('curator.title')}</h3>
      <p className={styles.desc}>{t('curator.desc')}</p>

      {msg && <div className={styles.toast}>{msg}</div>}

      {/* Status display */}
      <div className={styles.statusCard}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>{t('curator.status')}</span>
          <span className={statusClass}>{statusLabel}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>{t('curator.last_run')}</span>
          <span>{state.lastRun ? new Date(state.lastRun).toLocaleString() : t('curator.never')}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>{t('curator.run_count')}</span>
          <span>{state.runs}</span>
        </div>
      </div>

      {/* Policy info */}
      <div className={styles.policyBox}>
        <span>{t('curator.stale_threshold')}</span>
        <span>{t('curator.archive_threshold')}</span>
      </div>

      {/* Actions */}
      <div className={styles.actionRow}>
        {state.status !== 'active' ? (
          <button className={styles.btnPrimary} onClick={() => void action('resume', 'curator.resume_success')}>
            {t('curator.resume')}
          </button>
        ) : (
          <button className={styles.btnSecondary} onClick={() => void action('pause', 'curator.pause_success')}>
            {t('curator.pause')}
          </button>
        )}
        <button className={styles.btnAccent} onClick={() => void action('run', 'curator.run_success')}>
          {t('curator.run_now')}
        </button>
      </div>
    </div>
  )
}
