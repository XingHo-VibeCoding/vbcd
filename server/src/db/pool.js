// PostgreSQL 连接池（Day 17：文件存储 → 数据库 迁移的第 2 步，见 SPEC §7.3）
// 懒加载：第一次查询时才建池；进程退出时由 index.js 统一关闭。
// 未配 DATABASE_URL → 503 DB_NOT_CONFIGURED；库连不上 → 503 DB_UNAVAILABLE。
import pg from 'pg'
import { fail } from '../services/errors.js'

const { Pool } = pg

// 连接池配置：数据量小、单机部署，4 个连接足够；空闲 10s 释放，避免拖累 pg 重启
const POOL_OPTIONS = {
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000, // 5 秒拿不到连接就报错，别让请求吊着
}

let pool = null

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim())
}

// 取连接池：未配置直接抛业务错误；出错时把驱动错误包装成统一格式
function getPool() {
  if (!dbConfigured()) {
    throw fail('DB_NOT_CONFIGURED', '未配置 DATABASE_URL，数据库读接口不可用', 503)
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL.trim(), ...POOL_OPTIONS })
    // 池内空闲连接的报错不进请求链路，打日志即可（否则会触发未捕获异常）
    pool.on('error', (err) => console.error(`[db] 空闲连接报错：${err.message}`))
  }
  return pool
}

/**
 * 与 query() 相同的执行入口，但**不**把驱动错误包成 DB_UNAVAILABLE ——
 * 写路径要靠原始 SQLSTATE 分辨可预期错误（如 23505 主键冲突），包装后 code 会丢。
 * 调用方必须自己兜错误：连接类错（ECONNREFUSED 等）与 SQL 错都会原样冒出，
 * 由写路径决定是转 DB_UNAVAILABLE、重试还是上抛 INTERNAL。
 */
export async function execute(text, params = []) {
  const p = getPool() // 未配 DATABASE_URL 时同样抛 DB_NOT_CONFIGURED
  const result = await p.query(text, params)
  return result.rows
}

/**
 * 执行一条参数化 SQL，返回 rows。
 * 连接类错误（pg 无法正常结束的）统一包装成 DB_UNAVAILABLE；
 * SQL 本身报错（语法、权限等）原样上抛给 errorHandler 记 INTERNAL。
 */
export async function query(text, params = []) {
  const p = getPool() // 放在 try 外：DB_NOT_CONFIGURED 不该被包装成 DB_UNAVAILABLE
  try {
    const result = await p.query(text, params)
    return result.rows
  } catch (err) {
    // 两类都归 DB_UNAVAILABLE（503）：
    //  - 不带 severity：连接层错误（ECONNREFUSED / ETIMEDOUT / ENOTFOUND）
    //  - 带 severity：SQL/认证错误（28P01 认证失败、42P01 表不存在…）——也不把 SQLSTATE 透给前端
    // 细节全留在服务端日志（request-log + console.error 走 stderr），前端只见统一口径
    console.error(`[db] 查询失败${err.code ? `（${err.code}）` : ''}：${err.message}`)
    throw fail('DB_UNAVAILABLE', '数据库暂时不可用，请稍后再试', 503)
  }
}

/** 进程退出前关池（index.js 收到 SIGTERM/SIGINT 时调用）。没有池则为 no-op。 */
export async function closePool() {
  if (!pool) return
  const p = pool
  pool = null
  await p.end().catch(() => {})
}
