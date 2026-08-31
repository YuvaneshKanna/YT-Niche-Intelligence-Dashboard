import { NextResponse, after } from 'next/server';
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

function formatRequestedAt(date: Date): string {
    return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).replace(',', ',');
}

async function ensurePendingDeletesTab(sheets: any, spreadsheetId: string | undefined) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = (meta.data.sheets || []).some(
        (s: any) => s.properties?.title === 'Pending Deletes'
    );
    if (exists) return;

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                { addSheet: { properties: { title: 'Pending Deletes' } } },
            ],
        },
    });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Pending Deletes!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
            values: [['YT URL', 'Handle', 'Requested By', 'Requested At', 'Status']],
        },
    });
}

export async function GET() {
    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const [manualRes, diffRes] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId,
                // A2:O, not A2:L — M/N/O carry the audit stamp (Audited By /
                // Audited At / Audit Hash). Confirmed empty across all 205
                // rows before being claimed.
                range: 'Manual Sheet!A2:O',
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
            niche: (row[3] || '').trim(),
            category: (row[4] || '').trim(),
            format: (row[5] || '').trim(),
            producedBy: (row[6] || '').trim(),
            nicheGroup: (row[7] || '').trim(),
            verified: (row[8] || '').trim(),
            sharedOn: normalizeDate(row[9]),
            tracking: (row[10] || '').trim(),
            postedBy: (row[11] || '').trim(),
            auditedBy: (row[12] || '').trim(),
            auditedAt: (row[13] || '').trim(),
            auditHash: (row[14] || '').trim(),
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
        const { ytUrl, type, niche, category, format, producedBy, nicheGroup, verified, tracking, handle, auditedBy, auditedAt, auditHash } = body;

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

        // Label the audit columns the first time anything is written to them,
        // so the sheet reads as a sheet rather than three unnamed columns of
        // timestamps. Idempotent, and mirrors how Pending Deletes seeds its
        // own header row.
        if (auditedAt !== undefined) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Manual Sheet!M1:O1',
                valueInputOption: 'RAW',
                requestBody: { values: [['Audited By', 'Audited At', 'Audit Hash']] },
            });
        }

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'RAW',
                data: [
                    { range: `Manual Sheet!C${sheetRow}`, values: [[type ?? '']] },
                    { range: `Manual Sheet!D${sheetRow}`, values: [[niche ?? '']] },
                    { range: `Manual Sheet!E${sheetRow}`, values: [[category ?? '']] },
                    { range: `Manual Sheet!F${sheetRow}`, values: [[format ?? '']] },
                    { range: `Manual Sheet!G${sheetRow}`, values: [[producedBy ?? '']] },
                    { range: `Manual Sheet!H${sheetRow}`, values: [[nicheGroup ?? '']] },
                    { range: `Manual Sheet!I${sheetRow}`, values: [[verified ?? '']] },
                    { range: `Manual Sheet!K${sheetRow}`, values: [[tracking ?? '']] },
                    ...(handle ? [{ range: `Manual Sheet!B${sheetRow}`, values: [[handle]] }] : []),
                    // Only written when the caller is recording a verification.
                    // A plain field save leaves the stamp alone, so the hash
                    // stops matching and the channel returns to the queue.
                    ...(auditedAt !== undefined
                        ? [
                            { range: `Manual Sheet!M${sheetRow}`, values: [[auditedBy ?? '']] },
                            { range: `Manual Sheet!N${sheetRow}`, values: [[auditedAt ?? '']] },
                            { range: `Manual Sheet!O${sheetRow}`, values: [[auditHash ?? '']] },
                        ]
                        : []),
                ],
            },
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { ytUrl, handle, requestedBy } = body;

        if (!ytUrl) {
            return NextResponse.json({ success: false, error: 'ytUrl is required' }, { status: 400 });
        }

        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const manualSheetMeta = (meta.data.sheets || []).find(
            (s: any) => s.properties?.title === 'Manual Sheet'
        );
        const manualSheetId = manualSheetMeta?.properties?.sheetId;

        if (manualSheetId === undefined) {
            return NextResponse.json({ success: false, error: 'Manual Sheet not found' }, { status: 500 });
        }

        const lookup = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Manual Sheet!A2:A',
        });

        const rows = lookup.data.values || [];
        const rowIndex = rows.findIndex((r) => (r[0] || '').trim() === ytUrl.trim());

        if (rowIndex === -1) {
            return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 });
        }

        const sheetRowZeroIndexed = rowIndex + 1;

        await ensurePendingDeletesTab(sheets, spreadsheetId);

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Pending Deletes!A:E',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [[
                    ytUrl.trim(),
                    handle || '',
                    requestedBy || 'unknown',
                    formatRequestedAt(new Date()),
                    'PENDING',
                ]],
            },
        });

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: manualSheetId,
                                dimension: 'ROWS',
                                startIndex: sheetRowZeroIndexed,
                                endIndex: sheetRowZeroIndexed + 1,
                            },
                        },
                    },
                ],
            },
        });

        const webhookUrl = process.env.N8N_DISCORD_CLEANUP_WEBHOOK_URL;
        if (webhookUrl) {
            after(async () => {
                try {
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ytUrl: ytUrl.trim(),
                            handle: handle || '',
                            requestedBy: requestedBy || 'unknown',
                        }),
                    });
                } catch (err) {
                    console.error('n8n webhook call failed:', err);
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}