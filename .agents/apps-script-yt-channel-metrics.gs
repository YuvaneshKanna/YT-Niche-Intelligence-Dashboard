// ══════════════════════════════════════════════════════════════════
// YT Channel Metrics — maintenance web app
// Revised 2026-08-25. Behaviour is unchanged; three defects fixed.
//
//  1. clearSheet1 / clearSheet2 wiped only 'A7:Z1000' with clearContent().
//     Two problems: the 1000-row cap silently stopped clearing once a run
//     produced more rows than that, and clearContent() leaves the rows
//     FORMATTED. The Sheets API counts a formatted-but-empty row as part of
//     the table, so n8n's appendOrUpdate wrote below the block — which is why
//     Sheet1 filled from row 1001 instead of row 7.
//
//  2. deduplicateByKey called sheet.deleteRow() once per duplicate. At 48k
//     rows that is thousands of separate spreadsheet operations and blows the
//     6-minute Apps Script limit. Replaced with the same filter-and-rewrite
//     approach the cleanup functions already use.
//
//  3. Snapshot dates were parsed with `new Date(raw)`. A cell that comes back
//     as a Sheets serial number (e.g. 46259) parses as 46259 MILLISECONDS —
//     1970 — which is older than every cutoff, so the row would be deleted.
//     toDate_() handles Date objects, ISO strings and serials.
// ══════════════════════════════════════════════════════════════════


// Google Sheets counts days from 1899-12-30.
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);

// Every tracked sheet uses the same header block: row 4 names, data from 7.
const FIRST_DATA_ROW = 7;


// ── Helper: safe column index lookup ─────────────────────────────
function getColIdx(headers, name) {
  return headers.indexOf(name);
}


// ── Helper: parse whatever Sheets hands back into a Date ─────────
// getValues() returns a Date for date-formatted cells, a string for text
// cells, and a serial number in some conditions. Only the first two were
// handled before, and a serial silently became 1970 — old enough that the
// retention filters would delete the row.
function toDate_(raw) {
  if (raw instanceof Date) return raw;

  if (typeof raw === 'number') {
    // Plausible serial range: 2000-01-01 (36526) through 2100 (73050).
    if (raw > 20000 && raw < 90000) {
      return new Date(SHEETS_EPOCH_MS + Math.round(raw) * 86400000);
    }
    return new Date(NaN);
  }

  const text = String(raw || '').trim();
  if (!text) return new Date(NaN);
  return new Date(text);
}


// ── Helper: wipe every data row and collapse the sheet ───────────
// clearContent() alone leaves the rows formatted, and formatted-but-empty
// rows still count as table rows to the Sheets API. Deleting the surplus
// collapses the table so the next append lands at FIRST_DATA_ROW. One row is
// kept so the sheet always has a formatted template to grow from.
function clearDataRows_(ssMain, sheetName) {
  const sheet = ssMain.getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + ' not found');

  const maxRows = sheet.getMaxRows();
  if (maxRows < FIRST_DATA_ROW) return;

  sheet.getRange(FIRST_DATA_ROW, 1, maxRows - FIRST_DATA_ROW + 1, sheet.getMaxColumns())
       .clearContent();

  const surplus = maxRows - FIRST_DATA_ROW;
  if (surplus > 0) sheet.deleteRows(FIRST_DATA_ROW + 1, surplus);
}


// ── Clear Sheet1 data rows only ───────────────────────────────────
function clearSheet1(ssMain) {
  clearDataRows_(ssMain, 'Sheet1_Outlier_Videos');
}


// ── Clear Sheet2 data rows only ───────────────────────────────────
function clearSheet2(ssMain) {
  clearDataRows_(ssMain, 'Sheet2_Past7Days_Uploads');
}


// ── Deduplicate a single sheet by key column ──────────────────────
// Keeps the LAST occurrence of each key, which is what the previous
// bottom-up delete loop did. Rewrites in one clear + one write instead of
// one API call per duplicate row.
function deduplicateByKey(sheet, keyColumnName, headerRow, dataStartRow) {
  const data = sheet.getDataRange().getValues();
  if (data.length < dataStartRow) return 0;

  const headers = data[headerRow - 1];
  const keyIdx  = headers.indexOf(keyColumnName);
  if (keyIdx === -1) return 0;

  const dataRows = data.slice(dataStartRow - 1);
  if (dataRows.length === 0) return 0;

  // Walk bottom-up so the newest row for a key is the one marked to keep.
  const seen      = new Set();
  const keepFlags = new Array(dataRows.length).fill(true);

  for (let i = dataRows.length - 1; i >= 0; i--) {
    const key = String(dataRows[i][keyIdx]).trim();
    if (!key) continue;
    if (seen.has(key)) keepFlags[i] = false;
    else seen.add(key);
  }

  const kept    = dataRows.filter(function (row, i) { return keepFlags[i]; });
  const removed = dataRows.length - kept.length;
  if (removed === 0) return 0;

  const numCols = data[0].length;
  sheet.getRange(dataStartRow, 1, dataRows.length, numCols).clearContent();
  if (kept.length > 0) {
    sheet.getRange(dataStartRow, 1, kept.length, numCols).setValues(kept);
  }

  return removed;
}


// ── Deduplicate All_Video_Snapshots and Sheet4 by Row_Key ─────────
function deduplicateMainSheets(ssMain) {
  let totalRemoved = 0;

  const configs = [
    { name: 'All_Video_Snapshots',           key: 'Row_Key', headerRow: 4, dataRow: 7 },
    { name: 'Sheet4_Daily_Channel_Snapshot', key: 'Row_Key', headerRow: 4, dataRow: 7 },
  ];

  configs.forEach(function (config) {
    const sheet = ssMain.getSheetByName(config.name);
    if (sheet) totalRemoved += deduplicateByKey(sheet, config.key, config.headerRow, config.dataRow);
  });

  return totalRemoved;
}


// ── Tiered retention for All_Video_Snapshots ──────────────────────
// HISTORICAL    → keep 7 days
// RECENT_UPLOAD → keep 30 days
// OUTLIER       → keep 90 days
function cleanAllVideoSnapshots(ssMain) {
  const sheet = ssMain.getSheetByName('All_Video_Snapshots');
  if (!sheet) return 0;

  const data    = sheet.getDataRange().getValues();
  if (data.length < FIRST_DATA_ROW) return 0;
  const headers = data[3];

  const recordTypeIdx   = getColIdx(headers, 'Record_Type');
  const snapshotDateIdx = getColIdx(headers, 'Snapshot_Date');
  const durHMSIdx       = getColIdx(headers, 'Duration_HMS');

  if (recordTypeIdx === -1 || snapshotDateIdx === -1) return 0;

  const today = new Date();
  const day7  = new Date(today - 7.5  * 86400000);
  const day30 = new Date(today - 30.5 * 86400000);
  const day90 = new Date(today - 90.5 * 86400000);

  const dataRows = data.slice(6);

  const kept = dataRows.filter(function (row) {
    const recordType   = String(row[recordTypeIdx]).trim();
    const snapshotDate = toDate_(row[snapshotDateIdx]);
    if (isNaN(snapshotDate.getTime())) return true;   // unparseable — keep it

    if (recordType === 'HISTORICAL')    return snapshotDate >= day7;
    if (recordType === 'RECENT_UPLOAD') return snapshotDate >= day30;
    if (recordType === 'OUTLIER')       return snapshotDate >= day90;
    return true;
  });

  const removed = dataRows.length - kept.length;

  if (removed > 0) {
    const numCols = data[0].length;
    // Bound the clear to rows that actually exist — the old +10 could run
    // past the end of the sheet and throw.
    const clearRows = Math.min(dataRows.length + 10, sheet.getMaxRows() - FIRST_DATA_ROW + 1);
    sheet.getRange(FIRST_DATA_ROW, 1, clearRows, numCols).clearContent();

    if (kept.length > 0) {
      sheet.getRange(FIRST_DATA_ROW, 1, kept.length, numCols).setValues(kept);
      if (durHMSIdx !== -1) {
        sheet.getRange(FIRST_DATA_ROW, durHMSIdx + 1, kept.length, 1)
             .setNumberFormat('[h]:mm:ss');
      }
    }
  }

  return removed;
}


// ── Clean Sheet4 rows older than 90 days ─────────────────────────
function cleanOldChannelSnapshots(ssMain) {
  const sheet = ssMain.getSheetByName('Sheet4_Daily_Channel_Snapshot');
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  if (data.length < FIRST_DATA_ROW) return 0;
  const headers = data[3];

  const snapshotDateIdx = getColIdx(headers, 'Snapshot_Date');
  if (snapshotDateIdx === -1) return 0;

  const cutoff   = new Date(new Date() - 90 * 86400000);
  const dataRows = data.slice(6);

  const kept = dataRows.filter(function (row) {
    const snapshotDate = toDate_(row[snapshotDateIdx]);
    if (isNaN(snapshotDate.getTime())) return true;
    return snapshotDate >= cutoff;
  });

  const removed = dataRows.length - kept.length;

  if (removed > 0) {
    const numCols   = data[0].length;
    const clearRows = Math.min(dataRows.length + 10, sheet.getMaxRows() - FIRST_DATA_ROW + 1);
    sheet.getRange(FIRST_DATA_ROW, 1, clearRows, numCols).clearContent();

    if (kept.length > 0) {
      sheet.getRange(FIRST_DATA_ROW, 1, kept.length, numCols).setValues(kept);
    }
  }

  return removed;
}


// ── Debug ─────────────────────────────────────────────────────────
function debugInfo(ssMain) {
  const sheet   = ssMain.getSheetByName('All_Video_Snapshots');
  const data    = sheet.getDataRange().getValues();
  const headers = data[3];
  return {
    totalRows:       data.length,
    headerRow:       headers,
    recordTypeIdx:   headers.indexOf('Record_Type'),
    snapshotDateIdx: headers.indexOf('Snapshot_Date'),
    sampleRow:       data[6],
  };
}


// ── Full maintenance run ──────────────────────────────────────────
function runMaintenance(ssMain) {
  return {
    mainSheetDupsRemoved:  deduplicateMainSheets(ssMain),
    historicalRowsDeleted: cleanAllVideoSnapshots(ssMain),
    sheet4RowsDeleted:     cleanOldChannelSnapshots(ssMain),
  };
}


// ── Main entry point ──────────────────────────────────────────────
function doGet(e) {
  const ssMain = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;

  if (action === 'clearSheet1') {
    try {
      clearSheet1(ssMain);
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'Sheet1 cleared' })
      );
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: err.toString() })
      );
    }
  }

  if (action === 'clearSheet2') {
    try {
      clearSheet2(ssMain);
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'Sheet2 cleared' })
      );
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: err.toString() })
      );
    }
  }

  if (action === 'maintenance') {
    try {
      const results = runMaintenance(ssMain);
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'maintenance done', results })
      );
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: err.toString() })
      );
    }
  }

  if (action === 'debug') {
    try {
      const info = debugInfo(ssMain);
      return ContentService.createTextOutput(JSON.stringify(info));
    } catch (err) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: err.toString() })
      );
    }
  }

  return ContentService.createTextOutput(
    JSON.stringify({ status: 'error', message: 'Unknown action: ' + (action || 'none') })
  );
}
