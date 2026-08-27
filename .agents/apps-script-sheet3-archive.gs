// ══════════════════════════════════════════════════════════════════
// Sheet3 Date Archive — maintenance web app
// Bound to the Sheet3_Date_Archive_Template spreadsheet
// (10_BoC4F9kpcPrMUUX8KDrbjdN1R8WMoBsEZbx4ClpCI).
//
// This is a SEPARATE script from the one on YT Channel Metrics. Used by two
// n8n nodes: `HTTP Request to create Date Tab` and `Sheet 3 Maintenance`.
//
// Revised 2026-08-25. Behaviour and response shapes unchanged; four fixes:
//
//  1. cleanupOldTabs identified date tabs with `new Date(name)`, which is far
//     too permissive — a tab named "2026" parses as 2026-01-01, older than the
//     cutoff, and would be silently DELETED. Now only exact YYYY-MM-DD names
//     count as date tabs.
//
//  2. deduplicateByKey called sheet.deleteRow() once per duplicate. Replaced
//     with a single clear + write, the same approach used elsewhere. The old
//     form blows the 6-minute Apps Script limit once a tab holds a few
//     thousand rows, and these tabs are already ~1,400.
//
//  3. createDateTab cleared a hardcoded 'A7:Z1000'. Now clears whatever the
//     copied template actually spans.
//
//  4. createDateTab could leave a stray "Copy of Sheet3_Date_Archive_Template"
//     behind if setName threw. Now cleaned up.
// ══════════════════════════════════════════════════════════════════


// ── Strict date-tab name test ────────────────────────────────────
const DATE_TAB_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDateTab_(name) {
  if (!DATE_TAB_RE.test(name)) return false;
  return !isNaN(new Date(name + 'T00:00:00Z').getTime());
}

function dateTabValue_(name) {
  return new Date(name + 'T00:00:00Z');
}


// ── Create new date tab from template ────────────────────────────
function createDateTab(ss, tabName) {
  const template = ss.getSheetByName('Sheet3_Date_Archive_Template');

  if (!template) {
    return { status: 'error', message: 'Template not found' };
  }

  if (ss.getSheetByName(tabName)) {
    return { status: 'exists', tabName: tabName };
  }

  let newSheet = null;
  try {
    newSheet = template.copyTo(ss);
    newSheet.setName(tabName);

    const maxRows = newSheet.getMaxRows();
    if (maxRows >= 7) {
      newSheet.getRange(7, 1, maxRows - 6, newSheet.getMaxColumns()).clearContent();
    }

    return { status: 'created', tabName: tabName };
  } catch (err) {
    if (newSheet && newSheet.getName() !== tabName) {
      try { ss.deleteSheet(newSheet); } catch (ignored) {}
    }
    return { status: 'error', message: err.toString(), tabName: tabName };
  }
}


// ── Cleanup date tabs older than 90 days ─────────────────────────
function cleanupOldTabs(ss) {
  const today   = new Date();
  let   deleted = 0;

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === 'Sheet3_Date_Archive_Template') return;
    if (!isDateTab_(name)) return;

    const diffDays = (today - dateTabValue_(name)) / 86400000;
    if (diffDays > 90) {
      ss.deleteSheet(sheet);
      deleted++;
    }
  });

  return deleted;
}


// ── Deduplicate a single sheet by key column ──────────────────────
// Keeps the LAST occurrence of each key, matching the previous bottom-up
// delete loop.
function deduplicateByKey(sheet, keyColumnName, headerRow, dataStartRow) {
  const data = sheet.getDataRange().getValues();
  if (data.length < dataStartRow) return 0;

  const headers = data[headerRow - 1];
  const keyIdx  = headers.indexOf(keyColumnName);
  if (keyIdx === -1) return 0;

  const dataRows = data.slice(dataStartRow - 1);
  if (dataRows.length === 0) return 0;

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


// ── Deduplicate last 7 date tabs only ────────────────────────────
function deduplicateRecentTabs(ss) {
  let totalRemoved = 0;

  const dateTabs = ss.getSheets()
    .filter(function (s) { return isDateTab_(s.getName()); })
    .sort(function (a, b) { return dateTabValue_(b.getName()) - dateTabValue_(a.getName()); })
    .slice(0, 7);

  dateTabs.forEach(function (sheet) {
    totalRemoved += deduplicateByKey(sheet, 'Video_ID', 4, 7);
  });

  return totalRemoved;
}


// ── Main entry point ──────────────────────────────────────────────
function doGet(e) {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter.action;

  // Create new date tab
  if (!action || action === 'createTab') {
    const tabName = e.parameter.tabName;

    if (!tabName || tabName.trim() === '') {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'tabName is empty or missing' })
      );
    }

    const result = createDateTab(ss, tabName.trim());
    return ContentService.createTextOutput(JSON.stringify(result));
  }

  // Sheet3 maintenance — cleanup old tabs + dedup recent tabs
  if (action === 'sheet3maintenance') {
    try {
      const tabsDeleted = cleanupOldTabs(ss);
      const dupsRemoved = deduplicateRecentTabs(ss);
      const activeTabs  = ss.getSheets()
        .filter(function (s) { return isDateTab_(s.getName()); }).length;

      return ContentService.createTextOutput(
        JSON.stringify({
          status:      'sheet3 maintenance done',
          dateTabs:    activeTabs,
          tabsDeleted: tabsDeleted,
          dupsRemoved: dupsRemoved,
        })
      );
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
