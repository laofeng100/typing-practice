/**
 * 本地时区日期串 YYYY-MM-DD。
 * 注意：依赖服务器 TZ=Asia/Shanghai（docker-compose.yml 已配置）。
 */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
