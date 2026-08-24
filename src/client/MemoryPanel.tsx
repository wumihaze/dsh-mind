/**
 * MemoryPanel: CRUD for persistent memory entries.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import styles from './Mind.module.css'

interface MemoryTopic {
  name: string
  title: string
  preview: string
}

interface MemoryData {
  entries: string[]
  topics: MemoryTopic[]
  totalChars: number
  budget: number
}

interface MemoryPanelProps {
  t: (key: string) => string
}

/**
 * Memory management panel: list, add, remove entries.
 * @param props - Translation function.
 */
export function MemoryPanel({ t }: MemoryPanelProps): ReactNode {
  const [data, setData] = useState<MemoryData | null>(null)
  const [newEntry, setNewEntry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/dsh-mind/memory')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
    // Auto-refresh: the agent can write memory via its `memory` tool while the
    // panel is open, so poll every few seconds to keep the view in sync.
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [load])

  const add = async () => {
    const text = newEntry.trim()
    if (!text) return
    try {
      const res = await fetch('/dsh-mind/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
      setNewEntry('')
      setMsg(t('memory.add_success'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (idx: number) => {
    try {
      const res = await fetch(`/dsh-mind/memory/${idx}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
      setMsg(t('memory.remove_success'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const startEdit = (idx: number, text: string) => {
    setEditingIdx(idx)
    setEditText(text)
  }

  const saveEdit = async (idx: number) => {
    const text = editText.trim()
    if (!text) return
    try {
      const res = await fetch(`/dsh-mind/memory/${idx}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setData(d)
      setEditingIdx(null)
      setMsg(t('memory.edit_success'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const budgetPct = data ? Math.round((data.totalChars / data.budget) * 100) : 0

  return (
    <div>
      <h3>{t('memory.title')}</h3>
      <p className={styles.desc}>{t('memory.desc')}</p>

      {/* Budget indicator */}
      {data && (
        <div className={styles.budgetBar}>
          <div
            className={budgetPct > 90 ? styles.budgetDanger : styles.budgetFill}
            style={{ width: `${Math.min(100, budgetPct)}%` }}
          />
        </div>
      )}
      {data && (
        <span className={styles.budgetText}>
          {data.totalChars} / {data.budget} {t('memory.char_count')}
        </span>
      )}

      {msg && <div className={styles.toast}>{msg}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {/* Topic memory files (read-only, from ~/.dsh/memory/*.md) */}
      {data && data.topics.length > 0 && (
        <div className={styles.topicSection}>
          <h4 className={styles.topicTitle}>{t('memory.topics')}</h4>
          <ul className={styles.list}>
            {data.topics.map((tp) => (
              <li key={tp.name} className={styles.topicItem}>
                <span className={styles.topicName}>{tp.title || tp.name}</span>
                <span className={styles.topicPreview}>{tp.preview}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Entry list */}
      {data && data.entries.length === 0 && (
        <p className={styles.empty}>{t('memory.empty')}</p>
      )}
      {data && data.entries.length > 0 && (
        <ul className={styles.list}>
          {data.entries.map((entry, i) => (
            <li key={i} className={styles.listItem}>
              {editingIdx === i ? (
                <div className={styles.addRow}>
                  <input
                    type="text"
                    className={styles.input}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(i)
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    autoFocus
                  />
                  <button className={styles.btnPrimary} onClick={() => void saveEdit(i)}>
                    {t('memory.save')}
                  </button>
                  <button className={styles.btnSecondary} onClick={() => setEditingIdx(null)}>
                    {t('memory.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <span className={styles.listLabel}>{entry}</span>
                  <button
                    className={styles.btnSmall}
                    onClick={() => startEdit(i, entry)}
                    title={t('memory.edit')}
                  >
                    {t('memory.edit')}
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => void remove(i)}
                    title={t('memory.remove')}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <div className={styles.addRow}>
        <input
          type="text"
          className={styles.input}
          placeholder={t('memory.add_placeholder')}
          value={newEntry}
          onChange={(e) => setNewEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <button className={styles.btnPrimary} onClick={() => void add()}>
          {t('memory.add')}
        </button>
      </div>
    </div>
  )
}
