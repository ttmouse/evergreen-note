export type Positions = Record<string, { x: number; y: number }>
let connection: Promise<IDBDatabase> | undefined
// IndexedDB transactions from pagehide, layout pause and unmount can overlap.
// Serialize them so an older snapshot can never finish after a newer one.
let writeTail: Promise<void> = Promise.resolve()
function open() {
  return connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('notekit-network-positions', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('layouts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { connection = undefined; reject(request.error) }
  })
}
export async function readPositions(scope: string): Promise<Positions> {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const request = db.transaction('layouts').objectStore('layouts').get(scope)
      request.onsuccess = () => resolve(request.result || {})
      request.onerror = () => reject(request.error)
    })
  } catch { return {} }
}
export function writePositions(scope: string, positions: Positions) {
  const snapshot = { ...positions }
  writeTail = writeTail.then(async () => {
    try {
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('layouts', 'readwrite')
        tx.objectStore('layouts').put(snapshot, scope)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } catch { /* Layout cache failure must not affect note storage. */ }
  })
  return writeTail
}
