import { NextResponse } from 'next/server';
import { google } from 'googleapis';

function getAuthClient() {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

export async function GET() {
    try {
        const auth = getAuthClient();
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

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { ytUrl, previousHandle, currentHandle } = body;

        if (!ytUrl) {
            return NextResponse.json({ success: false, error: 'ytUrl required' }, { status: 400 });
        }

        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const lookup = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Handle Diff!A2:A',
        });

        const rows = lookup.data.values || [];
        const normUrl = (u: string) =>
            (u || '').trim().toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '')

        const rowIndex = rows.findIndex(r => normUrl(r[0] || '') === normUrl(ytUrl))

        if (rowIndex === -1) {
            return NextResponse.json({ success: false, error: 'Entry not found' }, { status: 404 });
        }

        const sheetRow = rowIndex + 2;
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: [
                    { range: `Handle Diff!B${sheetRow}`, values: [[previousHandle ?? '']] },
                    { range: `Handle Diff!C${sheetRow}`, values: [[currentHandle ?? '']] },
                ],
            },
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}