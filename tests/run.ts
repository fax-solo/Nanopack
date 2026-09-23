process.env.ELECTRON_RUN_AS_NODE = '1'

export async function run() {
  console.log('\nNanoPack test suite')
  console.log('───────────────────')

  let failed = 0

  async function runCase(name: string, fn: () => Promise<void>) {
    try {
      console.log(`\n▸ ${name}`)
      await fn()
    } catch (e: any) {
      failed++
      console.error(`  ✗ FAIL: ${e.message}`)
    }
  }

  await runCase('NPK roundtrip (pack → verify → extract)', async () => {
    const m = await import('../src/main/container/__tests__/npk-roundtrip.test')
    await m.run()
  })
  await runCase('NPK repack (remove/add/modify)', async () => {
    const m = await import('../src/main/container/__tests__/npk-roundtrip.test')
    await m.runRepack()
  })
  await runCase('Safe join', async () => {
    const m = await import('../src/main/container/__tests__/safe-join.test')
    await m.run()
  })
  await runCase('Size estimate (bounded, conservative)', async () => {
    const m = await import('../src/main/services/pack-service')
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-est-test-'))
    try {
      const random = Buffer.alloc(2 * 1024 * 1024)
      for (let i = 0; i < random.length; i += 4) random.writeUInt32BE(Math.floor(Math.random() * 0xffffffff) >>> 0, i)
      for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(dir, `doc_${i}.txt`), 'hello world '.repeat(2000))
      for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, `clip_${i}.mp4`), random)

      const t0 = Date.now()
      const est = await m.estimatePack(dir)
      const elapsed = Date.now() - t0

      assertBounds(est.quickSize > 0, 'quickSize should be positive')
      assertBounds(est.deepSize > 0, 'deepSize should be positive')
      assertBounds(est.quickSize <= est.totalSize, 'quickSize should never exceed source size')
      assertBounds(est.deepSize <= est.quickSize, 'deepSize should never exceed quickSize')
      assertBounds(elapsed < 60_000, `estimate should finish fast, took ${elapsed}ms`)
      // Media-heavy trees must not be advertised as highly compressible.
      assertBounds(est.deepSize > est.totalSize * 0.85, `deep should be conservative on media, got savings ${((1 - est.deepSize / est.totalSize) * 100).toFixed(0)}%`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }

    function assertBounds(cond: boolean, msg: string) {
      if (!cond) throw new Error(msg)
    }
  })

  await runCase('Slim repack (media re-encode → npk roundtrip)', async () => {
    const m = await import('../src/main/services/slim-service')
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')
    const { spawn } = await import('child_process')
    const { runProcess } = await import('../src/main/container/npk-writer')

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-slim-test-'))
    const src = path.join(tmp, 'source')
    const sub = path.join(src, 'audio', 'voices')
    fs.mkdirSync(sub, { recursive: true })

    // Generate a real 2s mono sine tone as an uncompressed WAV (very shrinkable).
    const sampleRate = 16000
    const n = sampleRate * 2
    const pcm = Buffer.alloc(n * 2)
    for (let i = 0; i < n; i++) {
      const v = Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 12000 * (1 - i / n)
      pcm.writeInt16LE(Math.round(v), i * 2)
    }
    const header = Buffer.alloc(44)
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8)
    header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
    header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
    header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
    const wav = Buffer.concat([header, pcm])
    fs.writeFileSync(path.join(sub, 'line.wav'), wav)
    fs.writeFileSync(path.join(src, 'music.flac'), wav)
    fs.writeFileSync(path.join(src, 'keep.txt'), 'payload file unchanged')

    // Fixture video: a real 1s testsrc encoded to H.264, so slim has a video
    // stream to re-encode to HEVC.
    const fixture = path.join(src, 'cutscene.mp4')
    const venc = await runProcess('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=128x72:rate=15', '-c:v', 'libx264', '-preset', 'ultrafast', fixture])
    if (venc.code !== 0) throw new Error(`fixture video encode failed: ${venc.stderr.toString()}`)

    const outNpk = path.join(tmp, 'slim.npk')
    const res = await m.slimPack(src, outNpk, 'quick', 'balance')
    if (!res.success) throw new Error(`slimPack failed: ${JSON.stringify(res)}`)
    if (res.audioReencoded === 0) throw new Error('expected at least 1 audio to be re-encoded')
    if (res.videoReencoded === 0) throw new Error('expected video to be re-encoded')
    if (res.filesProcessed !== 4) throw new Error(`expected 4 files, got ${res.filesProcessed}`)

    // The packed npk must extract to a valid tree with the re-encoded media,
    // and the re-encoded audio must genuinely be Opus and smaller.
    const reader = await import('../src/main/container/npk-reader')
    const dest = path.join(tmp, 'out')
    fs.mkdirSync(dest, { recursive: true })
    const ex = await reader.extractNpk(outNpk, dest)
    if (!ex.success) throw new Error(`slim npk extract failed: ${ex.errors}`)

    const wavOut = path.join(dest, 'audio', 'voices', 'line.wav')
    const probe = await runProcess('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', wavOut])
    if (probe.code !== 0) throw new Error('ffprobe of re-encoded audio failed')
    const codecs = probe.stdout.toString()
    if (!codecs.toLowerCase().includes('opus')) throw new Error(`re-encoded audio is not opus: got "${codecs.trim()}"`)
    if (fs.statSync(wavOut).size >= wav.length) throw new Error('re-encoded audio did not shrink')

    const verify = await (await import('../src/main/container/npk-reader')).verifyNpk(outNpk)
    if (!verify.success) throw new Error('slim npk failed verify')

    console.log(`  ✓ slim ok: ${res.audioReencoded} audio (${wav.length} → ${fs.statSync(wavOut).size} B) + ${res.videoReencoded} video re-encoded, archive ${res.originalSize} → ${res.finalSize} B`)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  console.log('\n' + '─'.repeat(19))
  if (failed === 0) {
    console.log('All tests passed ✓')
    process.exit(0)
  } else {
    console.error(`${failed} test group(s) failed ✗`)
    process.exit(1)
  }
}

run()