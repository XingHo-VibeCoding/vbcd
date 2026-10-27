// 登录限流与反向代理边界自测（SPEC §5.6.12）。
// 不接触真实数据：只检查 Express 的 trust proxy 判定和登录失败计数。
import assert from 'node:assert/strict'
import http from 'node:http'
import proxyaddr from 'proxy-addr'
import bcrypt from 'bcryptjs'

process.env.AUTH_ENABLED = '0'
process.env.AUTH_WRITE_REQUIRED = '1'
process.env.TRUST_PROXY = '172.30.0.0/16'
process.env.PASSWORD_HASH = bcrypt.hashSync('selftest-only-password', 4)

const { createApp } = await import('../src/app.js')
const app = createApp()
const trustProxy = app.get('trust proxy fn')

assert.equal(typeof trustProxy, 'function')
assert.equal(trustProxy('172.30.0.5'), true, 'compose Nginx 网段必须受信')
assert.equal(trustProxy('10.0.0.5'), false, '任意其他私网不能默认受信')
assert.equal(trustProxy('127.0.0.1'), false, '直连地址不能被当作 Nginx 代理')

function forwardedIp(proxyIp, xForwardedFor) {
  return proxyaddr({
    socket: { remoteAddress: proxyIp },
    headers: { 'x-forwarded-for': xForwardedFor },
  }, trustProxy)
}

assert.equal(forwardedIp('172.30.0.5', '198.51.100.10'), '198.51.100.10', '经 Nginx 转发应取真实访客 IP')
assert.equal(forwardedIp('172.30.0.5', '198.51.100.10, 203.0.113.77'), '203.0.113.77', 'Nginx 追加的直连来源应覆盖客户端伪造值')
assert.notEqual(
  forwardedIp('172.30.0.5', '198.51.100.10'),
  forwardedIp('172.30.0.5', '198.51.100.11'),
  '不同访客经同一代理后必须得到不同限流 IP',
)
assert.equal(forwardedIp('127.0.0.1', '203.0.113.99'), '127.0.0.1', '绕过受信代理时不得采用客户端伪造的 XFF')

const server = http.createServer(app)
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()

try {
  const request = (forwardedFor) => fetch(`http://127.0.0.1:${port}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ password: 'wrong-password' }),
  })

  const statuses = []
  for (let i = 0; i < 6; i += 1) {
    const response = await request(`198.51.100.${i + 1}`)
    statuses.push(response.status)
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429], '直连伪造 XFF 不得绕过同一来源限流')
  console.log('auth-proxy-selftest: PASS')
} finally {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
}
