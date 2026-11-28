import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '76px',
          background: 'linear-gradient(135deg, #040c27 0%, #0a1128 55%, #071029 100%)',
          color: '#f5f8ff',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '15px',
              background: '#2142E7',
              fontSize: '30px',
              fontWeight: 700
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', fontSize: '32px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            ApplyRecall
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: '68px',
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.035em',
              maxWidth: '960px'
            }}
          >
            Autofill job applications in seconds
          </div>
          <div style={{ display: 'flex', fontSize: '30px', lineHeight: 1.35, color: '#a8c4ff', maxWidth: '940px' }}>
            One-click ATS autofill and answer memory for Greenhouse, Lever, Workday &amp; Ashby.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '22px', color: '#7f97c9' }}>
          <div style={{ display: 'flex', width: '9px', height: '9px', borderRadius: '999px', background: '#79bdff' }} />
          <div style={{ display: 'flex' }}>applyrecall.vercel.app</div>
        </div>
      </div>
    ),
    size
  )
}
