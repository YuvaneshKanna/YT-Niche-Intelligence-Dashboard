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

function normalizeType(raw: string): string {
    const val = (raw || '').trim().toLowerCase();
    if (val === 'shorts') return 'Shorts';
    if (val === 'long-form' || val === 'long form') return 'Long-form';
    return raw;
}

function normalizeDate(raw: string): string {
    return (raw || '').split(' ')[0];
}

export async function GET() {
    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const [manualRes, diffRes] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Manual Sheet!A2:I',
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Handle Diff!A2:E',
            }),
        ]);

        const manualRows = manualRes.data.values || [];
        const diffRows = diffRes.data.values || [];

        const normUrl = (url: string) =>
            url.trim().toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/^www\./, '')
                .replace(/\/$/, '')

        const diffUrls = new Set(diffRows.map((r) => normUrl(r[0] || '')));

        const channels = manualRows.map((row) => ({
            ytUrl: (row[0] || '').trim(),
            handle: (row[1] || '').trim(),
            type: normalizeType(row[2]),
            nicheCategory: (row[3] || '').trim(),
            subCategory: (row[4] || '').trim(),
            verified: (row[5] || '').trim(),
            sharedOn: normalizeDate(row[6]),
            tracking: (row[7] || '').trim(),
            postedBy: (row[8] || '').trim(),
            hasHandleDiff: diffUrls.has(normUrl(row[0] || '')),
        }));

        return NextResponse.json({ success: true, channels });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { ytUrl, type, nicheCategory, subCategory, verified, tracking, handle } = body;

        if (!ytUrl) {
            return NextResponse.json({ success: false, error: 'ytUrl is required' }, { status: 400 });
        }

        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const lookup = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Manual Sheet!A2:A',
        });

        const rows = lookup.data.values || [];
        const rowIndex = rows.findIndex((r) => (r[0] || '').trim() === ytUrl.trim());

        if (rowIndex === -1) {
            return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 });
        }

        const sheetRow = rowIndex + 2;

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: [
                    { range: `Manual Sheet!C${sheetRow}`, values: [[type ?? '']] },
                    { range: `Manual Sheet!D${sheetRow}`, values: [[nicheCategory ?? '']] },
                    { range: `Manual Sheet!E${sheetRow}`, values: [[subCategory ?? '']] },
                    { range: `Manual Sheet!F${sheetRow}`, values: [[verified ?? '']] },
                    { range: `Manual Sheet!H${sheetRow}`, values: [[tracking ?? '']] },
                    ...(handle ? [{ range: `Manual Sheet!B${sheetRow}`, values: [[handle]] }] : []),
                ],
            },
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}