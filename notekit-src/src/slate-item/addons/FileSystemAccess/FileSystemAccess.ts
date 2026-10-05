/* eslint-disable no-async-promise-executor */
import { Item, KyString } from '@/slate-item'
import { NewAddonParams } from '@/slate-item/engine/App'
import { after } from '@/slate-item/engine/helper'
import { atLater } from '@/slate-item/utils/atLater'
import { recur } from '@/slate-item/utils/recur'

declare global {
  interface Window {
    showOpenFilePicker: () => Promise<FileSystemFileHandle[]>
    showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
  }
}

/**
 * File System Access API 插件
 * 这个插件提供了读写本地文件的功能
 */
export function createFileSystemAccessAddon({ app, $ }: NewAddonParams) {
  class FileSystemAccess {
    dirHandle: FileSystemDirectoryHandle | null = null

    /**
     * 询问用户是否允许访问本地文件夹，如果允许则返回文件夹句柄
     * @returns
     */
    getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
      return new Promise(async (resolve) => {
        if (this.dirHandle) {
          resolve(this.dirHandle)
        } else {
          $.dialog.confirm(
            'Would you like to save file to local folder ?',
            async () => {
              try {
                const dirHandle = await window.showDirectoryPicker()
                this.dirHandle = dirHandle
                resolve(dirHandle)
              } catch (e) {
                console.error(e)
                resolve(null)
              }
            }
          )
        }
      })
    }

    /**
     * 遍历文件夹，读取文件
     * @param readFile
     * @returns
     */
    async readDirectory(
      readFile?: (name: string, entry: FileSystemHandle) => void
    ): Promise<void | unknown[]> {
      const directoryHandle = await this.getDirectoryHandle()
      if (!directoryHandle || !readFile) {
        return
      }
      const result = [] as any
      for await (const [name, entry] of directoryHandle.entries()) {
        // if (entry.kind === 'file') {
        //   console.log(`File: ${name}`);
        // } else if (entry.kind === 'directory') {
        //   console.log(`Directory: ${name}`);
        // }
        result.push(await readFile(name, entry))
      }
      return result
    }

    /**
     * 读取文件内容
     * @param fileHandle
     * @returns
     */
    async readFile(fileHandle: FileSystemFileHandle): Promise<string | null> {
      try {
        const file = await fileHandle.getFile()
        const text = await file.text()
        return text
      } catch (e) {
        console.error('Error reading file:', e)
        return null
      }
    }

    /**
     * 写入文件内容
     * @param fileName
     * @param content
     * @returns
     */
    async writeFile(fileName: string, content: any): Promise<void> {
      try {
        const dirHandle = await this.getDirectoryHandle()
        if (!dirHandle) return

        // 在写入数据的时候，先备份被修改的文件，命名："xxx.json.bak"，
        // 等写入完成并确认成功之后，再删除备份文件

        // 检查是否存在同名文件，并创建备份
        const backupFileName = `${fileName}.bak`
        if (await this.fileExists(fileName)) {
          await this.renameFile(fileName, backupFileName)
        }

        // 获取文件句柄并写入新内容
        const fileHandle = await dirHandle.getFileHandle(fileName, {
          create: true,
        })
        await this.writeToFileHandle(fileHandle, content)
        console.log(`Content written to ${fileName}`)

        // 验证文件内容是否成功写入
        const verifyContent = await this.readFile(fileHandle)
        if (verifyContent && verifyContent.trim() !== '') {
          // 文件内容非空，可以安全删除备份
          if (await this.fileExists(backupFileName)) {
            await this.deleteFile(backupFileName)
            console.log(`Backup file ${backupFileName} deleted`)
          }
        } else {
          // 文件内容为空，保留备份文件
          console.error(
            `Failed to write content to ${fileName}, keeping backup file.`
          )
        }
      } catch (e) {
        console.error('Error writing file:', e)
      }
    }

    /**
     * 检查文件是否存在
     * @param fileName
     * @returns
     */
    async fileExists(fileName: string): Promise<boolean> {
      try {
        await this.dirHandle!.getFileHandle(fileName)
        return true
      } catch {
        return false
      }
    }

    /**
     * 重命名文件
     * @param oldName
     * @param newName
     */
    async renameFile(oldName: string, newName: string): Promise<void> {
      const oldFileHandle = await this.dirHandle!.getFileHandle(oldName)
      const newFileHandle = await this.dirHandle!.getFileHandle(newName, {
        create: true,
      })
      const data = await this.readFile(oldFileHandle)
      if (data) {
        await this.writeToFileHandle(newFileHandle, data)
      }
    }

    /**
     * 写入文件内容
     * @param fileHandle
     * @param content
     */
    async writeToFileHandle(
      fileHandle: FileSystemFileHandle,
      content: string
    ): Promise<void> {
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    }

    /**
     * 删除文件
     * @param fileName
     */
    async deleteFile(fileName: string): Promise<void> {
      await this.dirHandle!.removeEntry(fileName)
    }

    writeTopicData(topicData: any) {
      const name = Item.headString(topicData).replace(/\//g, '_')
      return this.writeFile(
        `${name}.json`,
        JSON.stringify(topicData, null, 2)
      ).then(() => {
        console.log(`saved to ${name}.json`)
      })
    }

    async writeAllTopicData() {
      const result = await this.readDirectory(async (name, entry) => {
        if (name.endsWith('.json')) {
          // const content = await this.readFile(entry as FileSystemFileHandle);
          // console.log(content)
          return name
        }
      })
      if (!result || result.length < 3) {
        for (const topic of Object.values($.dbMemory.indexed.topic)) {
          const tree = $.dbMemory.getItem(topic.ky, {
            isRecur: true,
          })
          this.writeTopicData(tree)
        }
      }
    }

    addonInfo() {
      return {
        title: 'File System Access',
        quote:
          'Save topic data to local folder while editing. Notice: as the limitation of File System Access API, you may need to re-select the folder every time you open the app, and you will be asked to confirm the permission after loading.',
        defaultValue: 'off',
        updated: 2024_01_20,
      }
    }

    /**
     * 插件初始化函数
     */
    async addonRun() {
      this.writeAllTopicData()

      // 根据一个普通节点的 ky，获取它所在的主题节点的数据
      const getTopicData = (ky: KyString) => {
        const topicData = $.dbMemory
          .getParentItems(ky)
          .reverse()
          .find((item) => item.isTopic)
        if (topicData) {
          const tree = $.dbMemory.getItem(topicData.ky, {
            isRecur: true,
          })
          return tree
        }
        return null
      }

      after($.dbDisk.save, (_, item) => {
        if (this.dirHandle) {
          atLater(() => {
            const topicData = getTopicData(item.ky)
            if (topicData) {
              $.fileSystemAccess.writeTopicData(topicData)
            }
          }, 'save-topic-file')
        }
      })
    }
  }

  // 返回插件实例
  return { fileSystemAccess: new FileSystemAccess() }
}
