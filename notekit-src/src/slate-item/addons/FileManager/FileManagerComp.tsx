import React from 'react'
import { cls } from '../../styles'
import { useAddons } from '../../hooks/useAddons'
import { useAwait } from '../../hooks/useAwait'
import { datekit } from '../../utils/date/datekit'
import { EDITOR_INVOKER } from '../EditorView/EditorView'
import { isEmpty } from '../../utils/isEmpty'
import { $t } from '../../../i18n'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes'
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

interface FileNode extends UnitPersist {
  fileInfo: {
    ext: string
    name: string
    path: string
    size: number
    type: string
    md5: string
  }
  created: number
  updated: number
  fileStatus?: 'localOnly' | 'synced' | 'cloudOnly'
}

export function FileManagerComp() {
  const $ = useAddons()
  const [doc, setDoc] = React.useState<UnitPersist>({} as any)
  const EditorComponent = $.editorView.createComponent()

  useAwait(async () => {
    try {
      const conds = [{
        date: 0,
        dbid: $.libAdmin.HOME_DBID,
        tbName: 'file'
      }]
      const [allFiles, cache] = await Promise.all([
        (async () => {
          const serverData = await $.sync2.fetchAllServerData(conds)
          const key = `${$.libAdmin.HOME_DBID}-file`
          return (serverData[key] || []) as FileNode[]
        })(),
        caches.open('RoamEditv0-UserData')
      ])

      const requests = await cache.keys()
      const cachedPathsSet = new Set<string>()
      const localOnlyFiles: FileNode[] = []
      
      // Collect cached paths and find orphans
      // Cache keys are Request objects, url is full url
      for (const request of requests) {
        const url = new URL(request.url)
        // Pathname usually starts with /v2/data/files/...
        // We want data/files/...
        let path = decodeURIComponent(url.pathname)
        if (path.startsWith('/v2/')) {
          path = path.slice(4) // remove /v2/
        }
        
        if (path.startsWith('data/files/') || path.startsWith('data/images/')) {
          cachedPathsSet.add(path)
        }
      }

      // Check which cached files are NOT in server list
      const serverPathsSet = new Set(allFiles.map(f => f.fileInfo.path))
      
      for (const cachedPath of cachedPathsSet) {
        if (!serverPathsSet.has(cachedPath)) {
           // Orphan found
           const name = cachedPath.split('/').pop() || 'Unknown'
           const ext = name.split('.').pop() || ''
           localOnlyFiles.push({
             ky: 'local-' + name,
             fileInfo: {
               ext,
               name,
               path: cachedPath,
               size: 0, 
               type: 'unknown',
               md5: ''
             },
             created: 0,
             updated: 0,
             fileStatus: 'localOnly'
           } as any)
        }
      }

      const cloudFiles = allFiles.map((f) => {
        const isCached = cachedPathsSet.has(f.fileInfo.path)
        return { ...f, fileStatus: isCached ? 'synced' : 'cloudOnly' }
      })
      
      cloudFiles.sort((a, b) => b.created - a.created)

      const items = [
        ...localOnlyFiles.map(item => ({
          $isTmp: true,
          ky: item.ky + '-view',
          pky: 'AppFileManager',
          fileInfo: item.fileInfo,
          fileStatus: item.fileStatus,
          created: 0,
          updated: 0,
          leaves: [
            { text: '⚠️ [Local Only] ', color: 'red' },
            { text: item.fileInfo.name, bold: true },
          ]
        })),
        ...cloudFiles.map(item => ({
          $isTmp: true,
          ky: item.ky + '-view',
          pky: 'AppFileManager',
          fileInfo: item.fileInfo,
          fileStatus: item.fileStatus,
          created: item.created,
          updated: item.updated,
          leaves: [
            { text: item.fileStatus === 'synced' ? '✅ ' : '☁️ ' },
            { text: item.fileInfo.name, bold: true },
            { text: '  ' },
            { 
              text: formatBytes(item.fileInfo.size), 
              code: true 
            },
          ]
        }))
      ]

      const virtualDoc = {
        $isTmp: true,
        ky: 'AppFileManager',
        isTopic: true,
        leaves: [{ text: ZERO_WIDTH_SPACE }],
        subitems: items as unknown as UnitPersist[]
      } as UnitPersist

      setDoc(virtualDoc)

    } catch (e) {
      console.error("Failed to load files", e)
    }
  }, [])

  if (isEmpty(doc)) return <div style={{padding: '20px'}}>{$t`common.loading`}</div>

  // 无任何已上传文件时给出明确的空态提示；
  // 原实现直接渲染一个空内容的只读编辑器，视觉上等同于完全空白，用户会以为功能坏了
  if (isEmpty((doc as any).subitems)) {
    return (
      <div style={{ padding: '24px', color: 'var(--placeholder, #999)', fontSize: '14px' }}>
        {$t`fileManager.empty`}
      </div>
    )
  }

  return (
    <div className={cls`width: 100%; `}>
      <EditorComponent
        item={doc}
        fromRouter={false}
        invoker={EDITOR_INVOKER.OTHER}
        autoFocus={false}
        readOnly
        moreComponentVisible={false}
        preventSaving
      />
    </div>
  )
}
