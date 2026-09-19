// 用法：node scripts/hash-password.js "你的口令"
// 只在本机生成哈希；口令明文不进入任何文件、不进入聊天记录
import bcrypt from 'bcryptjs'

const password = process.argv[2]

if (!password) {
  console.error('用法：node scripts/hash-password.js "你的口令"')
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 10)
console.log(hash)
console.log('\n把上面这一整串复制到 server/.env 的 PASSWORD_HASH= 后面即可。')
