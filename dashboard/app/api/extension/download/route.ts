import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'applyrecall-extension.zip')

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Extension zip package not found' }, { status: 404 })
  }

  const fileBuffer = fs.readFileSync(filePath)

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="applyrecall-extension.zip"',
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'no-cache'
    }
  })
}
