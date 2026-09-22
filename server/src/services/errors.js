// 业务错误的统一构造方式：带 status 与 code 的错误对象，
// 由 middleware/errors.js 统一转成 { ok:false, error:{ code, message } }（SPEC 第 5 章）
export function fail(code, message, status = 400) {
  return Object.assign(new Error(message), { status, code })
}
