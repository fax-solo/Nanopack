import fs from 'fs'
import crypto from 'crypto'

// Streaming SHA-256 for large-file memory safety (avoids loading entire file into a Buffer)
export function streamHashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
