import { NextResponse } from 'next/server'
import { google } from 'googleapis'

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function GET() {
  try {
    const auth = getAuthClient()
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Master Rule Table!A2:D',
    })
    const rows = res.data.values || []
    
    // Build structured object
    const niches: string[] = []
    const categories: string[] = []
    const formats: string[] = []
    const producedBy: string[] = []
    
    rows.forEach(row => {
      if (row[0]?.trim()) niches.push(row[0].trim())
      if (row[1]?.trim()) categories.push(row[1].trim())
      if (row[2]?.trim()) formats.push(row[2].trim())
      if (row[3]?.trim()) producedBy.push(row[3].trim())
    })
    
    return NextResponse.json({
      success: true,
      niches: [...new Set(niches)],
      categories: [...new Set(categories)],
      formats: [...new Set(formats)],
      producedBy: [...new Set(producedBy)],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { field, value } = await request.json()
    if (!field || !value) {
      return NextResponse.json({ success: false, error: 'field and value required' }, { status: 400 })
    }
    
    const fieldToColumn: Record<string, string> = {
      niche: 'A',
      category: 'B', 
      format: 'C',
      producedBy: 'D',
    }
    
    const col = fieldToColumn[field]
    if (!col) {
      return NextResponse.json({ success: false, error: 'Invalid field' }, { status: 400 })
    }
    
    const auth = getAuthClient()
    const sheets = google.sheets({ version: 'v4', auth })
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Master Rule Table!${col}:${col}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[value.trim()]] },
    })
    
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
