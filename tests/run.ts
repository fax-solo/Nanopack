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