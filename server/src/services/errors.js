// 业务错误的统一构造方式：带 status 与 code 的错误对象，
// 由 middleware/errors.js 统一转成 { ok:false, error:{ code, message } }（SPEC 第 5 章）
//
// expose: true —— 标记「这条 message 是给用户看的人工中文」，errorHandler 会原样透出；
// 未标记的错误（Node fs / pg / body-parser 抛的原始错误）一律被替换成按类中文兜底（Day 23）。
// detail（可选）—— 原始错误对象，供 errorHandler 写进服务端日志（不进响应），避免包装后丢失排查线索。
export function fail(code, message, status = 400, detail) {
  return Object.assign(new Error(message), { status, code, expose: true, detail })
}
