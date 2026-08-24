/**
 * SkillDashboard: displays installed skills and their usage statistics.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import styles from './Mind.module.css'

interface SkillUsageEntry {
  uses: number
  lastUsed?: string
  provenance?: string
}

interface SkillsData {
  skills: string[]
  usage: Record<string, SkillUsageEntry>
}

interface SkillDashboardProps {
  t: (key: string) => string
}

/**
 * Skill usage dashboard: table of skills with stats.
 * @param props - Translation function.
 */
export function SkillDashboard({ t }: SkillDashboardProps): ReactNode {
  const [data, setData] = useState<SkillsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/dsh-mind/skills')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) return <div className={styles.error}>{error}</div>
  if (!data) return <p>{t('common.loading')}</p>

  const entries = data.skills.map((name) => ({
    name,
    usage: data.usage[name] ?? { uses: 0 },
  }))

  // Sort by usage descending
  entries.sort((a, b) => b.usage.uses - a.usage.uses)

  return (
    <div>
      <h3>{t('skills.title')}</h3>
      <p className={styles.desc}>{t('skills.desc')}</p>

      {entries.length === 0 && (
        <p className={styles.empty}>{t('skills.empty')}</p>
      )}

      {entries.length > 0 && (
        <>
          <p className={styles.muted}>{t('skills.total').replace('{n}', String(entries.length))}</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('skills.name')}</th>
                <th className={styles.num}>{t('skills.uses')}</th>
                <th>{t('skills.last_used')}</th>
                <th>{t('skills.provenance')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.name}>
                  <td className={styles.mono}>{e.name}</td>
                  <td className={styles.num}>{e.usage.uses}</td>
                  <td>{e.usage.lastUsed ?? '—'}</td>
                  <td>{e.usage.provenance ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
