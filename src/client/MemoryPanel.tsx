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

interface TopicEditorState {
  name: string
  title: string
  content: string
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
  const [topicEditor, setTopicEditor] = useState<TopicEditorState | null>(null)
  const [creatingTopic, setCreatingTopic] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicContent, setNewTopicContent] = useState('')

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

  const openTopicEditor = async (name: string) => {
    try {
      const res = await fetch(`/dsh-mind/memory/topic/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setTopicEditor({ name, title: name, content: d.content ?? '' })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const saveTopic = async () => {
    if (!topicEditor) return
    try {
      const res = await fetch(`/dsh-mind/memory/topic/${topicEditor.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: topicEditor.content }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTopicEditor(null)
      setMsg(t('memory.topic_saved'))
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteTopic = async (name: string, title: string) => {
    if (!confirm(t('memory.topic_delete_confirm').replace('{name}', title))) return
    try {
      const res = await fetch(`/dsh-mind/memory/topic/${name}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMsg(t('memory.topic_deleted'))
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const createTopic = async () => {
    const name = newTopicName.trim()
    const content = newTopicContent.trim()
    if (!name || !content) return
    try {
      const res = await fetch('/dsh-mind/memory/topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCreatingTopic(false)
      setNewTopicName('')
      setNewTopicContent('')
      setMsg(t('memory.topic_created'))
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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

      {/* Topic memory files (from ~/.dsh/memory/*.md) */}
      {(data && data.topics.length > 0) || creatingTopic ? (
        <div className={styles.topicSection}>
          <h4 className={styles.topicTitle}>
            {t('memory.topics')}{' '}
            <button className={styles.btnSmall} onClick={() => setCreatingTopic(!creatingTopic)}>
              {t('memory.topic_new')}
            </button>
          </h4>
          {creatingTopic && (
            <div className={styles.topicEditor}>
              <input
                type="text"
                className={styles.input}
                placeholder={t('memory.topic_name_placeholder')}
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
              />
              <textarea
                className={styles.input}
                rows={5}
                placeholder={t('memory.topic_content_placeholder')}
                value={newTopicContent}
                onChange={(e) => setNewTopicContent(e.target.value)}
              />
              <div className={styles.addRow}>
                <button className={styles.btnPrimary} onClick={() => void createTopic()}>
                  {t('memory.topic_create')}
                </button>
                <button className={styles.btnSecondary} onClick={() => setCreatingTopic(false)}>
                  {t('memory.cancel')}
                </button>
              </div>
            </div>
          )}
          <ul className={styles.list}>
            {data?.topics.map((tp) => (
              <li key={tp.name} className={styles.topicItem}>
                <span className={styles.topicName}>{tp.title || tp.name}</span>
                <span className={styles.topicPreview}>{tp.preview}</span>
                <span className={styles.topicActions}>
                  <button className={styles.btnSmall} onClick={() => void openTopicEditor(tp.name)}>
                    {t('memory.edit')}
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => void deleteTopic(tp.name, tp.title || tp.name)}
                    title={t('memory.remove')}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Topic editor (markdown) */}
      {topicEditor && (
        <div className={styles.topicEditor}>
          <h4 className={styles.topicTitle}>{topicEditor.name}.md</h4>
          <textarea
            className={styles.input}
            rows={14}
            value={topicEditor.content}
            onChange={(e) => setTopicEditor({ ...topicEditor, content: e.target.value })}
          />
          <div className={styles.addRow}>
            <button className={styles.btnPrimary} onClick={() => void saveTopic()}>
              {t('memory.save')}
            </button>
            <button className={styles.btnSecondary} onClick={() => setTopicEditor(null)}>
              {t('memory.cancel')}
            </button>
          </div>
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
