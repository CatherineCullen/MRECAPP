/** Replace {{variable}} tokens in a template string. Unknown tokens are left as-is. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/** Wrap rendered email body content in the standard MREC email container. */
export function wrapEmailBody(bodyContent: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
${bodyContent}
<p style="color:#666;font-size:14px;margin-top:24px">— Marlboro Ridge Equestrian Center</p>
</div>`
}
