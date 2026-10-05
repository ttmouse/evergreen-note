import React from 'react'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import { useAddons } from '../../hooks/useAddons'
import { DEFAULT_STRMAP_CONTENT } from './customRules'

export function StrmapSettings() {
  const $ = useAddons()
  const [content, setContent] = React.useState(() => $.app.cfg.strmapContent ?? DEFAULT_STRMAP_CONTENT)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  async function save() {
    setSaving(true)
    setError('')
    setStatus('')
    try {
      await $.strmap.saveCustomRules(content)
      setStatus('已保存并生效')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  return <div style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} onChange={e => e.stopPropagation()}>
    <TextField fullWidth multiline minRows={8} maxRows={18} label="映射规则"
      value={content} onChange={e => { setContent(e.target.value); setStatus(''); setError('') }}
      inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 }, spellCheck: false }}
      helperText={'输入末尾匹配时自动替换。格式：{";yy": "✓"}。正则用 /表达式/，动态内容可用函数；{:caret} 指定光标位置，{:enter} 换行。留空可停用自定义规则。'} />
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <Button type="button" variant="contained" disabled={saving} onClick={save}>保存并生效</Button>
      <Button type="button" disabled={saving} onClick={() => { setContent(DEFAULT_STRMAP_CONTENT); setStatus(''); setError('') }}>填入默认规则</Button>
    </div>
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    {status && <Alert severity="success" sx={{ mt: 1 }}>{status}</Alert>}
  </div>
}
