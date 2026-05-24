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
            range: 'Favourites!A2:C',
        })
        const rows = res.data.values || []
        const favourites = rows.map(row => ({
            ytUrl: (row[0] || '').trim(),
            addedBy: (row[1] || '').trim(),
            addedAt: (row[2] || '').trim(),
        }))
        return NextResponse.json({ success: true, favourites })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { ytUrl, addedBy } = await request.json()
        if (!ytUrl || !addedBy) {
            return NextResponse.json({ success: false, error: 'ytUrl and addedBy required' }, { status: 400 })
        }

        const auth = getAuthClient()
        const sheets = google.sheets({ version: 'v4', auth })
        const spreadsheetId = process.env.GOOGLE_SHEET_ID

        // Check if already exists
        const existing = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Favourites!A2:B',
        })
        const rows = existing.data.values || []
        const alreadyExists = rows.some(
            r => (r[0] || '').trim() === ytUrl.trim() && (r[1] || '').trim() === addedBy.trim()
        )
        if (alreadyExists) return NextResponse.json({ success: true, message: 'Already exists' })

        // Append new row
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Favourites!A:C',
            valueInputOption: 'RAW',
            requestBody: {
                values: [[ytUrl, addedBy, new Date().toISOString()]],
            },
        })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const { ytUrl, addedBy } = await request.json()
        if (!ytUrl || !addedBy) {
            return NextResponse.json({ success: false, error: 'ytUrl and addedBy required' }, { status: 400 })
        }

        const auth = getAuthClient()
        const sheets = google.sheets({ version: 'v4', auth })
        const spreadsheetId = process.env.GOOGLE_SHEET_ID

        const existing = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Favourites!A2:B',
        })
        const rows = existing.data.values || []
        const rowIndex = rows.findIndex(
            r => (r[0] || '').trim() === ytUrl.trim() && (r[1] || '').trim() === addedBy.trim()
        )

        if (rowIndex === -1) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

        const sheetRow = rowIndex + 2
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `Favourites!A${sheetRow}:C${sheetRow}`,
        })

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}