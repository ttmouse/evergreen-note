import React from 'react'
import { $t } from '../../../i18n'
import { EleOuter, EleIcon } from '../../components/Ele'
import { Tip } from '../../components/Tip/Tip'
import { ItemNode } from '../../interfaces/item'
import { cls, preset } from '../../styles'
import { Icon } from '../../../components/MaterialIcon'
import { useAddons } from '../../hooks/useAddons'
import { ReactEditor } from '../../slate.inc'
import { Transforms } from 'slate'
import { useEditor } from '@/slate-item/hooks/useEditor'
import { showSnack } from '@/slate-item/utils/msg/showSnack'

export function FileManagerDeleteIcon(props: { ctxItem: ItemNode }) {
  const { ctxItem } = props
  const $ = useAddons()
  const editor = useEditor()

  if (ctxItem.pky === 'AppFileManager') {
    const status = (ctxItem as any).fileStatus // 'localOnly' | 'synced' | 'cloudOnly'
    const isLocal = status === 'localOnly' || status === 'synced'
    const isCloud = status === 'synced' || status === 'cloudOnly'

    const style = {
      padding: '2px 6px',
      borderRadius: '4px',
      backgroundColor: status === 'synced' ? '#e8f5e9' : (status === 'localOnly' ? '#fff3e0' : '#e0f7fa'),
      color: status === 'synced' ? '#2e7d32' : (status === 'localOnly' ? '#ff9800' : '#006064'),
      fontSize: '0.85em',
      cursor: isLocal ? 'pointer' : 'default',
      border: `1px solid ${status === 'synced' ? '#c8e6c9' : (status === 'localOnly' ? '#ffe0b2' : '#b2ebf2')}`,
      display: 'inline-flex',
      alignItems: 'center',
      userSelect: 'none' as any,
      verticalAlign: 'middle',
      margin: '0 2px',
    }

    const setStatus = (newStatus: 'localOnly' | 'synced' | 'cloudOnly') => {
      const path = ReactEditor.findPath(editor as any, ctxItem)
      Transforms.setNodes(editor as any, { fileStatus: newStatus } as any, { at: path })
    }

    const handleDeleteCache = () => {
        if (!isLocal) return
        $.dialog.confirm(
          'Are you sure you want to delete the local cache for this file?',
          async () => {
            try {
              const cache = await caches.open('EvergreenNote-v0-UserData');
              const path = '/v2/' + (ctxItem as any).fileInfo.path;
              const result = await cache.delete(path);
              if (result) {
                // If it was synced, now it's cloudOnly. If it was localOnly, it's gone (or just remove from view?)
                // For localOnly, we should probably remove the item from view entirely or refresh
                if (status === 'localOnly') {
                   // Ideally remove node, but for now let's just mark it somehow or rely on refresh
                   // A refresh of file manager would be best
                   // But here we just update status to something that might indicate "deleted"
                   Transforms.removeNodes(editor as any, { at: ReactEditor.findPath(editor as any, ctxItem) })
                } else {
                   setStatus('cloudOnly')
                }
              }
            } catch (err) {
              console.error("Failed to delete cache", err);
            }
          }
        );
    }

    const handleDeleteCloud = () => {
      if (!isCloud) return
      $.dialog.confirm(
        $t`Are you sure you want to delete this file from the cloud? This action cannot be undone.`,
        async () => {
          try {
            const realKy = ctxItem.ky.replace("-view", "")
            const res = await $.http.post('/api/delete-file', {ky: realKy, path: (ctxItem as any).fileInfo.path}) as any
            
            if (res.code === 0) {
                if (status === 'synced') {
                    const path = '/v2/' + (ctxItem as any).fileInfo.path;
                    try {
                        const cache = await caches.open('EvergreenNote-v0-UserData');
                        await cache.delete(path)
                    } catch(err) {
                        console.error("Failed to delete cache after cloud deletion", err);
                    } finally {
                        // After attempting to delete from cache, remove the node from view regardless of cache deletion success
                        Transforms.removeNodes(editor as any, { at: ReactEditor.findPath(editor as any, ctxItem) })
                    }
                } else {
                    Transforms.removeNodes(editor as any, { at: ReactEditor.findPath(editor as any, ctxItem) })
                }
            } else {
                showSnack({content: `Failed to delete file: ${res.message}`, severity: 'error'})
            }
          } catch (e) {
            console.error('Failed to delete cloud file', e);
            showSnack({content: 'Network Error', severity: 'error'})
          }
        }
      );
    }
    const humanStatus = status === 'synced' ? 'Synced' : (status === 'localOnly' ? 'Local Only' : 'Cloud Only')

    const handleSearch = () => {
        $.search.showDialog({
            keyword: `file(${(ctxItem as any).fileInfo.path.split('/').pop()})`,
        })
    }

    return (
      <>
        <span style={style} onClick={handleDeleteCache} title={isLocal ? "Delete local cache" : "Not cached locally"}>
          {humanStatus}
        </span>
        <Tip title="Find references" interactive={false}>
            <EleOuter
                onClick={handleSearch}
                className={cls`margin-left: 4px; color: #1976d2; cursor: pointer;`}
            >
            <EleIcon classIcon={cls(preset.icon.basic)}>
                <Icon name="svg_search" size={16} />
            </EleIcon>
            </EleOuter>
        </Tip>
        {isCloud && (
        <Tip title="Delete from Cloud" interactive={false}>
            <EleOuter
                onClick={handleDeleteCloud}
                className={cls`margin-left: 4px; color: #ff5252; cursor: pointer;`}
            >
            <EleIcon classIcon={cls(preset.icon.basic)}>
                <Icon name="svg_trash" size={16} />
            </EleIcon>
            </EleOuter>
        </Tip>
        )}
      </>
    )
  }

  return null
}
