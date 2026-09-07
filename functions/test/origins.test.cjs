const { test, done, assert } = require('./harness.cjs')

// config reads the environment lazily, so origins.js has to be loaded after it is set.
function load(env) {
  for (const k of ['APP_ORIGINS', 'APP_ORIGIN', 'GCLOUD_PROJECT', 'GCP_PROJECT']) delete process.env[k]
  Object.assign(process.env, env)
  delete require.cache[require.resolve('../lib/oauth/origins.js')]
  delete require.cache[require.resolve('../lib/config.js')]
  return require('../lib/oauth/origins.js')
}

const HOSTED = 'https://genesysbe-cbd7e.web.app'

// The post-OAuth redirect target is vetted when the flow starts and stored server-side,
// because the callback is public and an unchecked redirect target is an open redirect.
test('an allowlisted origin is honoured', () => {
  const { resolveReturnOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  assert.strictEqual(resolveReturnOrigin(HOSTED), HOSTED)
})

test('the firebaseapp.com host is allowed too, with no configuration', () => {
  const { resolveReturnOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  const alt = 'https://genesysbe-cbd7e.firebaseapp.com'
  assert.strictEqual(resolveReturnOrigin(alt), alt)
})

test('an unknown origin falls back rather than being honoured', () => {
  const { resolveReturnOrigin, defaultOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  assert.strictEqual(resolveReturnOrigin('https://evil.com'), defaultOrigin())
})

// startsWith would let this through, which is why the comparison is on the parsed origin.
test('an attacker cannot smuggle an allowed origin into a path or query', () => {
  const { resolveReturnOrigin, defaultOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  for (const candidate of [
    `https://evil.com/?next=${HOSTED}`,
    `https://evil.com/${HOSTED}`,
    `https://evil.com#${HOSTED}`,
    `${HOSTED}.evil.com`,
    `https://genesysbe-cbd7e.web.app.evil.com`,
  ]) {
    assert.strictEqual(
      resolveReturnOrigin(candidate),
      defaultOrigin(),
      `honoured ${candidate}`,
    )
  }
})

test('a scheme change is not the same origin', () => {
  const { resolveReturnOrigin, defaultOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  assert.strictEqual(resolveReturnOrigin('http://genesysbe-cbd7e.web.app'), defaultOrigin())
})

test('a port change is not the same origin', () => {
  const { resolveReturnOrigin, defaultOrigin } = load({
    APP_ORIGINS: 'http://localhost:6001',
    GCLOUD_PROJECT: 'genesysbe-cbd7e',
  })
  assert.strictEqual(resolveReturnOrigin('http://localhost:6002'), defaultOrigin())
})

test('a path on an allowed origin is reduced to the origin', () => {
  const { resolveReturnOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  assert.strictEqual(resolveReturnOrigin(`${HOSTED}/project/abc`), HOSTED)
})

test('nonsense and empty candidates fall back', () => {
  const { resolveReturnOrigin, defaultOrigin } = load({ GCLOUD_PROJECT: 'genesysbe-cbd7e' })
  for (const candidate of [undefined, '', 'not a url', 'javascript:alert(1)', '//evil.com']) {
    assert.strictEqual(resolveReturnOrigin(candidate), defaultOrigin(), `honoured ${candidate}`)
  }
})

test('a configured origin is allowed alongside the derived ones', () => {
  const { resolveReturnOrigin } = load({
    APP_ORIGINS: 'https://apps.example.com,http://localhost:6001',
    GCLOUD_PROJECT: 'genesysbe-cbd7e',
  })
  assert.strictEqual(resolveReturnOrigin('https://apps.example.com'), 'https://apps.example.com')
  assert.strictEqual(resolveReturnOrigin('http://localhost:6001'), 'http://localhost:6001')
  assert.strictEqual(resolveReturnOrigin(HOSTED), HOSTED, 'derived origin still allowed')
})

test('the configured origin comes first, so it is the fallback', () => {
  const { defaultOrigin } = load({
    APP_ORIGINS: 'https://apps.example.com',
    GCLOUD_PROJECT: 'genesysbe-cbd7e',
  })
  assert.strictEqual(defaultOrigin(), 'https://apps.example.com')
})

done('origins')
