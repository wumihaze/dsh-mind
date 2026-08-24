/**
 * MindSection: the main dsh-mind settings panel with tab navigation.
 * Renders Memory, Skills, Curator, and Snapshots panels.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { MemoryPanel } from './MemoryPanel.tsx'
import { SkillDashboard } from './SkillDashboard.tsx'
import { CuratorConsole } from './CuratorConsole.tsx'
import styles from './Mind.module.css'

type Tab = 'memory' | 'skills' | 'curator' | 'snapshots'

interface MindSectionProps {
  t?: (key: string) => string
}

interface StatusData {
  memory: { count: number; budget: number }
  skills: { count: number }
  curator: { status: string; lastRun: string | null; runs: number }
}

/**
 * The main dsh-mind settings section component.
 * @param props - Optional `t` translation function.
 */
export function MindSection({ t: tProp }: MindSectionProps): ReactNode {
  const t = tProp ?? ((key: string) => key)
  const [tab, setTab] = useState<Tab>('memory')
  const [status, setStatus] = useState<StatusData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/dsh-mind/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'memory', label: t('tab.memory') },
    { id: 'skills', label: t('tab.skills') },
    { id: 'curator', label: t('tab.curator') },
    { id: 'snapshots', label: t('tab.snapshots') },
  ]

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{t('section.title')}</h2>
        <p className={styles.desc}>{t('section.desc')}</p>
      </header>

      {/* Status bar */}
      {status && (
        <div className={styles.statusBar}>
          <span className={styles.statusItem}>
            {t('status.memory_count')}: {status.memory.count}/{status.memory.budget}
          </span>
          <span className={styles.statusItem}>
            {t('status.skill_count')}: {status.skills.count}
          </span>
          <span className={styles.statusItem}>
            {t('status.curator_status')}: {t(
              `status.curator_${status.curator.status}`
            )}
          </span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {/* Tab navigation */}
      <nav className={styles.tabs} role="tablist">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            className={tab === tb.id ? styles.tabActive : styles.tab}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className={styles.content} role="tabpanel">
        {tab === 'memory' && <MemoryPanel t={t} />}
        {tab === 'skills' && <SkillDashboard t={t} />}
        {tab === 'curator' && <CuratorConsole t={t} />}
        {tab === 'snapshots' && <SnapshotsPanel t={t} />}
      </div>
    </div>
  )
}

/** Snapshots panel (inline to keep file count manageable). */
function SnapshotsPanel({ t }: { t: (key: string) => string }): ReactNode {
  const [snapshots, setSnapshots] = useState<Array<{ id: string; time: string }>>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/dsh-mind/snapshots')
      const data = await res.json()
      setSnapshots(data.snapshots ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rollback = async (id: string) => {
    if (!confirm(t('snapshots.confirm_rollback'))) return
    const res = await fetch(`/dsh-mind/snapshots/${id}/rollback`, { method: 'POST' })
    if (res.ok) setMsg(t('snapshots.rollback_success').replace('{id}', id))
  }

  const prune = async () => {
    const res = await fetch('/dsh-mind/snapshots/prune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keep: 10 }),
    })
    if (res.ok) {
      const data = await res.json()
      setMsg(t('snapshots.prune_success').replace('{n}', String(data.pruned)))
      void load()
    }
  }

  return (
    <div>
      <h3>{t('snapshots.title')}</h3>
      <p className={styles.desc}>{t('snapshots.desc')}</p>
      {msg && <div className={styles.toast}>{msg}</div>}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : snapshots.length === 0 ? (
        <p className={styles.empty}>{t('snapshots.empty')}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {snapshots.map((s) => (
              <li key={s.id} className={styles.listItem}>
                <span className={styles.listLabel}>{s.id}</span>
                <button className={styles.btnSmall} onClick={() => void rollback(s.id)}>
                  {t('snapshots.rollback')}
                </button>
              </li>
            ))}
          </ul>
          <button className={styles.btnSecondary} onClick={() => void prune()}>
            {t('snapshots.prune')}
          </button>
        </>
      )}
    </div>
  )
}
