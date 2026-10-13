// GitHub 动态接口（F16）：GET /api/github/activity → { configured, profile?, calendar?, events? }
import { request } from './client.js'

export async function getGithubActivity() {
  return request('/api/github/activity')
}

export function getGithubProjects() {
  return request('/api/github/projects')
}
