import fs from 'fs'
import path from 'path'
import { spawn, execSync } from 'child_process'
import { getBinary } from '../container/npk-writer'

export interface GpuInfo {
  name: string
  vramGB: number
  vulkanSupported: boolean
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown'
}

export async function detectGpu(): Promise<GpuInfo | null> {
  try {
    const vkInfoBin = getBinary('vulkaninfo')
    if (fs.existsSync(vkInfoBin)) {
      const output = execSync(`"${vkInfoBin}" --summary 2>/dev/null || true`, {
        encoding: 'utf-8',
        timeout: 5000,
      })
      const lines = output.split('\n')
      const gpuLines = lines.filter(l => l.includes('GPU') || l.includes('deviceName'))
      if (gpuLines.length > 0) {
        const name = gpuLines[0].split(':').pop()?.trim() || 'Unknown GPU'
        const isNvidia = name.toLowerCase().includes('nvidia')
        const isAmd = name.toLowerCase().includes('amd') || name.toLowerCase().includes('radeon')
        const isIntel = name.toLowerCase().includes('intel')

        return {
          name,
          vramGB: 8,
          vulkanSupported: true,
          vendor: isNvidia ? 'nvidia' : isAmd ? 'amd' : isIntel ? 'intel' : 'unknown',
        }
      }
    }
  } catch {}

  try {
    const nvidiaSmi = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || true', {
      encoding: 'utf-8',
      timeout: 5000,
    })
    if (nvidiaSmi.trim()) {
      const [name, memory] = nvidiaSmi.trim().split(', ')
      const vramGB = Math.round(parseInt(memory || '0', 10) / 1024)
      return { name, vramGB, vulkanSupported: true, vendor: 'nvidia' }
    }
  } catch {}

  return null
}

export async function upscaleVideo(
  inputPath: string,
  outputPath: string,
  engine: string,
  preset: string,
  onProgress?: (stage: string, percent: number, file?: string) => void
): Promise<{ success: boolean; path?: string; message?: string }> {
  const gpu = await detectGpu()
  if (!gpu || !gpu.vulkanSupported) {
    return {
      success: false,
      message: 'No Vulkan-capable GPU detected. Upscaling requires a GPU with Vulkan support.',
    }
  }

  if (gpu.vramGB < 4) {
    return {
      success: false,
      message: `Insufficient VRAM (${gpu.vramGB} GB). Minimum 4 GB required for upscaling.`,
    }
  }

  const video2x = getBinary('video2x')
  if (!fs.existsSync(video2x)) {
    return {
      success: false,
      message: 'Video2X binary not found. Please reinstall NanoPack.',
    }
  }

  const presetScale: Record<string, number> = {
    '480p-1080p': 2.25,
    '720p-1080p': 1.5,
    '720p-4K': 3,
    '1080p-4K': 2,
  }

  const scaleFactor = presetScale[preset] || 2
  const engineFlag = engine === 'anime4k' ? '--anime4k' : '--realesrgan'

  const outputDir = path.dirname(outputPath)
  fs.mkdirSync(outputDir, { recursive: true })

  return new Promise((resolve) => {
    const proc = spawn(video2x, [
      '-i', inputPath,
      '-o', outputPath,
      engineFlag,
      '-s', String(scaleFactor),
      '--vulkan',
    ])

    let lastOutput = ''

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      lastOutput = text
      const frameMatch = text.match(/frame\s*=\s*(\d+)/i)
      const fpsMatch = text.match(/fps\s*=\s*([\d.]+)/i)

      if (frameMatch || fpsMatch) {
        onProgress?.(
          `Upscaling${fpsMatch ? ` (${parseFloat(fpsMatch[1]).toFixed(1)} fps)` : ''}`,
          50,
          frameMatch ? `Frame ${frameMatch[1]}` : undefined
        )
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      lastOutput = data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        onProgress?.('Upscale complete', 100)
        resolve({
          success: true,
          path: outputPath,
          message: 'Video upscaled successfully',
        })
      } else {
        resolve({
          success: false,
          message: `Video2X exited with code ${code}. ${lastOutput}`,
        })
      }
    })

    proc.on('error', (err) => {
      resolve({
        success: false,
        message: `Failed to start Video2X: ${err.message}`,
      })
    })
  })
}
