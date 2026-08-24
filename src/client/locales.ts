/**
 * i18n dictionaries for the dsh-mind Web GUI panel (zh + en).
 */

export const zh: Record<string, string> = {
  // ── Section ──
  'section.title': '心智管理',
  'section.desc': '管理代理的持久记忆、技能使用和自动治理。',
  'section.nav': '心智',

  // ── Tabs ──
  'tab.memory': '记忆',
  'tab.skills': '技能',
  'tab.curator': '治理',
  'tab.snapshots': '快照',

  // ── Status ──
  'status.memory_count': '记忆条目',
  'status.skill_count': '技能数量',
  'status.curator_status': '治理状态',
  'status.curator_active': '活跃',
  'status.curator_paused': '已暂停',
  'status.curator_idle': '空闲',
  'status.budget_used': '预算使用',

  // ── Memory ──
  'memory.title': '持久记忆',
  'memory.desc': '代理的长期记忆条目（总预算 2200 字符）。',
  'memory.add_placeholder': '添加全局记忆条目…',
  'memory.add': '添加条目',
  'memory.empty': '暂无记忆条目',
  'memory.remove': '删除',
  'memory.char_count': '字符',
  'memory.add_success': '已添加记忆',
  'memory.add_error': '添加失败',
  'memory.remove_success': '已删除',
  'memory.edit': '编辑',
  'memory.save': '保存',
  'memory.cancel': '取消',
  'memory.edit_success': '已保存',
  'memory.quick_section': '全局记忆',
  'memory.topics': '经验库',
  'memory.topic_new': '新建主题',
  'memory.topic_name_placeholder': '主题名（小写字母/数字/连字符，如 dsh-notes）',
  'memory.topic_content_placeholder': '用 Markdown 写内容，以 # 标题开头…',
  'memory.topic_create': '创建',
  'memory.topic_saved': '主题已保存',
  'memory.topic_deleted': '主题已删除',
  'memory.topic_created': '主题已创建',
  'memory.topic_delete_confirm': '确定要删除主题「{name}」吗？',

  // ── Skills ──
  'skills.title': '技能仪表盘',
  'skills.desc': '查看已安装技能的使用统计。',
  'skills.empty': '暂无技能数据',
  'skills.name': '名称',
  'skills.uses': '使用次数',
  'skills.last_used': '最后使用',
  'skills.provenance': '来源',
  'skills.total': '共 {n} 个技能',

  // ── Curator ──
  'curator.title': '治理控制台',
  'curator.desc': '控制技能的自动归档与治理策略。',
  'curator.status': '状态',
  'curator.last_run': '上次运行',
  'curator.run_count': '运行次数',
  'curator.run_now': '立即运行',
  'curator.pause': '暂停',
  'curator.resume': '恢复',
  'curator.run_success': '治理已触发',
  'curator.pause_success': '已暂停',
  'curator.resume_success': '已恢复',
  'curator.never': '从未',
  'curator.stale_threshold': '闲置阈值：30 天',
  'curator.archive_threshold': '归档阈值：90 天',

  // ── Snapshots ──
  'snapshots.title': '快照管理',
  'snapshots.desc': '查看和回滚治理快照。',
  'snapshots.empty': '暂无快照',
  'snapshots.rollback': '回滚',
  'snapshots.prune': '清理旧快照',
  'snapshots.rollback_success': '已回滚到 {id}',
  'snapshots.prune_success': '已清理 {n} 个旧快照',
  'snapshots.keep': '保留数量',
  'snapshots.confirm_rollback': '确定要回滚到此快照吗？',

  // ── Common ──
  'common.loading': '加载中…',
  'common.error': '出错了',
  'common.retry': '重试',
  'common.actions': '操作',
}

export const en: Record<string, string> = {
  // ── Section ──
  'section.title': 'Mind Management',
  'section.desc': 'Manage your agent\'s persistent memory, skill usage, and auto-curation.',
  'section.nav': 'Mind',

  // ── Tabs ──
  'tab.memory': 'Memory',
  'tab.skills': 'Skills',
  'tab.curator': 'Curator',
  'tab.snapshots': 'Snapshots',

  // ── Status ──
  'status.memory_count': 'Memory entries',
  'status.skill_count': 'Skills',
  'status.curator_status': 'Curator status',
  'status.curator_active': 'Active',
  'status.curator_paused': 'Paused',
  'status.curator_idle': 'Idle',
  'status.budget_used': 'Budget used',

  // ── Memory ──
  'memory.title': 'Persistent Memory',
  'memory.desc': 'Long-term memory entries (2200 char budget).',
  'memory.add_placeholder': 'Add a global memory entry…',
  'memory.add': 'Add entry',
  'memory.empty': 'No memory entries yet',
  'memory.remove': 'Remove',
  'memory.char_count': 'chars',
  'memory.add_success': 'Memory added',
  'memory.add_error': 'Failed to add',
  'memory.remove_success': 'Removed',
  'memory.edit': 'Edit',
  'memory.save': 'Save',
  'memory.cancel': 'Cancel',
  'memory.edit_success': 'Saved',
  'memory.quick_section': 'Global memory',
  'memory.topics': 'Experience library',
  'memory.topic_new': 'New topic',
  'memory.topic_name_placeholder': 'Topic name (a-z, 0-9, hyphens, e.g. dsh-notes)',
  'memory.topic_content_placeholder': 'Markdown content, start with a # heading…',
  'memory.topic_create': 'Create',
  'memory.topic_saved': 'Topic saved',
  'memory.topic_deleted': 'Topic deleted',
  'memory.topic_created': 'Topic created',
  'memory.topic_delete_confirm': 'Delete topic "{name}"?',

  // ── Skills ──
  'skills.title': 'Skill Dashboard',
  'skills.desc': 'View usage statistics for installed skills.',
  'skills.empty': 'No skill data',
  'skills.name': 'Name',
  'skills.uses': 'Uses',
  'skills.last_used': 'Last used',
  'skills.provenance': 'Source',
  'skills.total': '{n} skills total',

  // ── Curator ──
  'curator.title': 'Curator Console',
  'curator.desc': 'Control auto-archiving and curation policy for skills.',
  'curator.status': 'Status',
  'curator.last_run': 'Last run',
  'curator.run_count': 'Runs',
  'curator.run_now': 'Run now',
  'curator.pause': 'Pause',
  'curator.resume': 'Resume',
  'curator.run_success': 'Curation triggered',
  'curator.pause_success': 'Paused',
  'curator.resume_success': 'Resumed',
  'curator.never': 'Never',
  'curator.stale_threshold': 'Stale threshold: 30 days',
  'curator.archive_threshold': 'Archive threshold: 90 days',

  // ── Snapshots ──
  'snapshots.title': 'Snapshot Management',
  'snapshots.desc': 'View and roll back curation snapshots.',
  'snapshots.empty': 'No snapshots',
  'snapshots.rollback': 'Rollback',
  'snapshots.prune': 'Prune old snapshots',
  'snapshots.rollback_success': 'Rolled back to {id}',
  'snapshots.prune_success': 'Pruned {n} old snapshots',
  'snapshots.keep': 'Keep count',
  'snapshots.confirm_rollback': 'Roll back to this snapshot?',

  // ── Common ──
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
  'common.retry': 'Retry',
  'common.actions': 'Actions',
}
