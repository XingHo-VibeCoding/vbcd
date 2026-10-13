import { request } from './client.js'

export function getHome(date) {
  return request(`/api/home${date ? `?date=${encodeURIComponent(date)}` : ''}`)
}
