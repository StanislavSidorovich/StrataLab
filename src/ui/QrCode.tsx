// A QR code drawn locally as an SVG (qrcode-generator, MIT): no image service, nothing leaves the page. Always dark on white,
// whatever the theme, because a scanner needs that.
import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

export function QrCode({ text, size = 176, label }: { text: string; size?: number; label: string }) {
  const svg = useMemo(() => {
    try {
      const q = qrcode(0, 'M')
      q.addData(text)
      q.make()
      const n = q.getModuleCount()
      let d = ''
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
      return { d, box: n + 4 }
    } catch {
      return null
    }
  }, [text])
  if (!svg) return null
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${svg.box} ${svg.box}`} shapeRendering="crispEdges" data-testid="vote-qr" style={{ background: '#fff', borderRadius: 6 }}>
      <path d={svg.d} fill="#000" />
    </svg>
  )
}
