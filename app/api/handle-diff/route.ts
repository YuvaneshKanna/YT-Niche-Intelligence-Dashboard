import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'Handle Diff!A2:E',
        });

        const rows = res.data.values || [];
        const diffs = rows.map((row) => ({
            ytUrl: (row[0] || '').trim(),
            previousHandle: (row[1] || '').trim(),
            currentHandle: (row[2] || '').trim(),
            sharedOn: (row[3] || '').trim(),
            dateChanged: (row[4] || '').trim(),
        }));

        return NextResponse.json({ success: true, diffs });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}