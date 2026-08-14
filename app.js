/* ===== INITIALIZATION ===== */
document.addEventListener("DOMContentLoaded", () => {
    showLoadingState();
    loadMockData();
});

/* ===== SPLASH SCREEN ===== */
function dismissSplash() {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('fade-out');
}

/* ===== MOCK DATA & RENDER ===== */
function fmt(n) { return (+n || 0).toLocaleString('vi-VN'); }

let MOCK_DATA = {
    overview: { totalOrders: 0, delivered: 0, pending: 0, successRate: 0, returnRate: 0 },
    chartVol: [],
    chartLabels: [],
    regions: [],
    // Per-date data for date selector & GTC compare
    allDates: [],           // sorted unique date strings (from Time column)
    dailyRegions: {},       // { dateKey: [ {name, total, delivered, pending, rate} ] }
    dailyGrandTotal: {},    // { dateKey: { volume, gtcRate, returnRate, ... } }
    rawData: []             // keep raw rows for re-processing
};

function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results.data),
            error: (err) => reject(err)
        });
    });
}

async function fetchGoogleSheetData() {
    const mainUrl = 'https://docs.google.com/spreadsheets/d/1S296AhJ6MlXN1-JYFNzQG6Uu-35UN132ovHC4o8jGq4/export?format=csv&gid=0';
    const ca1Url = 'https://docs.google.com/spreadsheets/d/1S296AhJ6MlXN1-JYFNzQG6Uu-35UN132ovHC4o8jGq4/export?format=csv&gid=806361295';
    const ca2Url = 'https://docs.google.com/spreadsheets/d/1S296AhJ6MlXN1-JYFNzQG6Uu-35UN132ovHC4o8jGq4/export?format=csv&gid=1395428739';

    const startTime = performance.now();
    updateLoadingStatus('Đang tải dữ liệu từ Google Sheets...');

    try {
        const [mainData, ca1Data, ca2Data] = await Promise.all([
            fetchCSV(mainUrl),
            fetchCSV(ca1Url),
            fetchCSV(ca2Url)
        ]);
        
        const elapsed = Math.round(performance.now() - startTime);
        updateLoadingStatus(`Dữ liệu tải xong (${elapsed}ms), đang xử lý...`);
        console.log(`[Perf] Download + parse: ${elapsed}ms`);
        
        processData(mainData, ca1Data, ca2Data);
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        const btn = document.getElementById('refreshBtn');
        if (btn) btn.classList.remove('spinning');
        updateLoadingStatus('❌ Lỗi: ' + (error.message || 'Không thể tải dữ liệu'));
    }
}

function showLoadingState() {
    // Show skeleton loading in KPI area
    const kpiWrap = document.getElementById('kpiOverview');
    if (kpiWrap) {
        kpiWrap.innerHTML = [1, 2, 3, 4].map(() => `
            <div class="kpi-card skeleton-card">
                <div class="skeleton-line" style="width:32px;height:32px;border-radius:9px;"></div>
                <div class="skeleton-line" style="width:80px;height:10px;margin-top:8px;"></div>
                <div class="skeleton-line" style="width:100px;height:24px;margin-top:6px;"></div>
            </div>
        `).join('');
    }
    // Show skeleton in compare table
    const compareTbody = document.getElementById('compareTbody');
    if (compareTbody) {
        compareTbody.innerHTML = [1, 2, 3].map(() => `
            <tr><td colspan="7"><div class="skeleton-line" style="width:100%;height:16px;"></div></td></tr>
        `).join('');
    }
    // Show skeleton in data table
    const dataTbody = document.querySelector('#dataTableOverview tbody');
    if (dataTbody) {
        dataTbody.innerHTML = [1,2,3,4,5,6].map(() => `
            <tr><td colspan="7"><div class="skeleton-line" style="width:100%;height:14px;"></div></td></tr>
        `).join('');
    }
}

function updateLoadingStatus(msg) {
    const el = document.getElementById('lastUpdate');
    if (el) el.innerText = msg;
}

function processData(mainData, ca1Data, ca2Data) {
    const parseNum = (str) => {
        if (!str) return 0;
        return parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
    };

    let totalOrders = 0;
    let delivered = 0;
    let returned = 0;

    let dailyVols = {};
    let regionMap = {};

    // Per-date structures
    let dailyRegions = {};   // { dateKey: { regionName: {name, total, delivered, pending} } }
    let dailyGrandTotal = {}; // { dateKey: { volume, gtcRate, returnRate, leadtime } }
    let allDateSet = new Set();

    MOCK_DATA.rawData = mainData;

    mainData.forEach(row => {
        let isGrandTotal = (row['Chi tiết'] === 'Grand Total' || !row['Cấp Quản Lý'] || !row['Cấp Quản Lý'].trim());
        let time = row['Time'];
        let vol = parseNum(row['Volume']);
        let gtcRate = parseNum(row['% GTC']);
        let returnRate = parseNum(row['% Chuyển trả']);

        let deliv = vol * gtcRate;
        let ret = vol * returnRate;

        if (time) allDateSet.add(time);

        if (isGrandTotal && time) {
            totalOrders += vol;
            delivered += deliv;
            returned += ret;

            if (!dailyVols[time]) dailyVols[time] = 0;
            dailyVols[time] += vol;

            // Store grand total per date
            dailyGrandTotal[time] = {
                volume: vol,
                gtcRate: gtcRate,
                returnRate: returnRate,
                leadtime: parseNum(row['Leadtime'])
            };
        } else if (!isGrandTotal && time) {
            let region = row['Chi tiết'];
            if (!region) return;

            let ganRate = parseNum(row['% Gán']);
            let gan = vol * ganRate;

            // Aggregate for overview
            if (!regionMap[region]) {
                regionMap[region] = { name: region, am: row['Cấp Quản Lý'] || '', total: 0, delivered: 0, gan: 0 };
            }
            regionMap[region].total += vol;
            regionMap[region].delivered += deliv;
            regionMap[region].gan += gan;

            // Per-date region data
            if (!dailyRegions[time]) dailyRegions[time] = {};
            if (!dailyRegions[time][region]) {
                dailyRegions[time][region] = { name: region, am: row['Cấp Quản Lý'] || '', total: 0, delivered: 0, gan: 0 };
            }
            dailyRegions[time][region].total += vol;
            dailyRegions[time][region].delivered += deliv;
            dailyRegions[time][region].gan += gan;
        }
    });

    let successRate = totalOrders ? (delivered / totalOrders * 100) : 0;
    let retRate = totalOrders ? (returned / totalOrders * 100) : 0;
    let pending = totalOrders - delivered - returned;

    let timeKeys = Object.keys(dailyVols).sort((a, b) => {
        let da = a.split(' - ')[0];
        let db = b.split(' - ')[0];
        return da.localeCompare(db);
    });
    let chartTimeKeys = timeKeys.slice(-7); // 7 ngày gần nhất cho chart
    let chartLabels = chartTimeKeys.map(t => {
        let parts = t.split(' - ');
        return parts.length > 1 ? parts[1] : t;
    });
    let chartVol = chartTimeKeys.map(t => Math.round(dailyVols[t]));

    let regions = Object.values(regionMap).map(r => {
        r.rate = r.total ? (r.delivered / r.total * 100) : 0;
        r.ganRate = r.total ? (r.gan / r.total * 100) : 0;
        r.gtcCount = Math.round(r.delivered);
        r.total = Math.round(r.total);
        r.delivered = Math.round(r.delivered);
        r.rate = parseFloat(r.rate.toFixed(1));
        r.ganRate = parseFloat(r.ganRate.toFixed(1));
        // Add (HBI) prefix if missing
        if (!r.name.startsWith('(HBI)')) r.name = '(HBI) ' + r.name;
        return r;
    });

    // Sort all dates
    let allDates = Array.from(allDateSet).sort((a, b) => {
        let da = a.split(' - ')[0];
        let db = b.split(' - ')[0];
        return da.localeCompare(db);
    });

    // Process dailyRegions into arrays with rate
    let dailyRegionsProcessed = {};
    for (let dateKey of allDates) {
        if (dailyRegions[dateKey]) {
            dailyRegionsProcessed[dateKey] = Object.values(dailyRegions[dateKey]).map(r => {
                r.rate = r.total ? (r.delivered / r.total * 100) : 0;
                r.ganRate = r.total ? (r.gan / r.total * 100) : 0;
                r.gtcCount = Math.round(r.delivered);
                r.total = Math.round(r.total);
                r.delivered = Math.round(r.delivered);
                r.rate = parseFloat(r.rate.toFixed(1));
                r.ganRate = parseFloat(r.ganRate.toFixed(1));
                if (!r.name.startsWith('(HBI)')) r.name = '(HBI) ' + r.name;
                return r;
            });
        }
    }

    MOCK_DATA.overview = {
        totalOrders: Math.round(totalOrders),
        delivered: Math.round(delivered),
        pending: Math.round(pending),
        successRate: parseFloat(successRate.toFixed(1)),
        returnRate: parseFloat(retRate.toFixed(1))
    };
    MOCK_DATA.chartLabels = chartLabels;
    MOCK_DATA.chartVol = chartVol;
    MOCK_DATA.regions = regions;
    MOCK_DATA.allDates = allDates;
    MOCK_DATA.dailyRegions = dailyRegionsProcessed;
    MOCK_DATA.dailyGrandTotal = dailyGrandTotal;

    // Helper to parse region data from the extra sheets
    const parseRegionsFromData = (sheetData) => {
        let rMap = {};
        let dRegions = {};
        let dGrandTotal = {};
        
        sheetData.forEach(row => {
            let isGrandTotal = (row['Chi tiết'] === 'Grand Total' || !row['Cấp Quản Lý'] || !row['Cấp Quản Lý'].trim());
            let time = row['Time'];
            if (!time) return;
            
            let vol = parseNum(row['Volume']);
            let gtcRate = parseNum(row['% GTC']);
            let deliv = vol * gtcRate;
            let ganRate = parseNum(row['% Gán']);
            let gan = vol * ganRate;
            
            if (isGrandTotal) {
                dGrandTotal[time] = {
                    volume: vol,
                    gtcRate: gtcRate
                };
                return;
            }

            let region = row['Chi tiết'];
            if (!region) return;

            if (!rMap[region]) rMap[region] = { name: region, am: row['Cấp Quản Lý'] || '', total: 0, delivered: 0, gan: 0 };
            rMap[region].total += vol;
            rMap[region].delivered += deliv;
            rMap[region].gan += gan;

            if (!dRegions[time]) dRegions[time] = {};
            if (!dRegions[time][region]) {
                dRegions[time][region] = { name: region, am: row['Cấp Quản Lý'] || '', total: 0, delivered: 0, gan: 0 };
            }
            dRegions[time][region].total += vol;
            dRegions[time][region].delivered += deliv;
            dRegions[time][region].gan += gan;
        });

        let allRegs = Object.values(rMap).map(r => {
            r.rate = r.total ? (r.delivered / r.total * 100) : 0;
            r.ganRate = r.total ? (r.gan / r.total * 100) : 0;
            r.gtcCount = Math.round(r.delivered);
            r.total = Math.round(r.total);
            r.delivered = Math.round(r.delivered);
            r.rate = parseFloat(r.rate.toFixed(1));
            r.ganRate = parseFloat(r.ganRate.toFixed(1));
            if (!r.name.startsWith('(HBI)')) r.name = '(HBI) ' + r.name;
            return r;
        });

        let dRegsProcessed = {};
        for (let dateKey of allDates) {
            if (dRegions[dateKey]) {
                dRegsProcessed[dateKey] = Object.values(dRegions[dateKey]).map(r => {
                    r.rate = r.total ? (r.delivered / r.total * 100) : 0;
                    r.ganRate = r.total ? (r.gan / r.total * 100) : 0;
                    r.gtcCount = Math.round(r.delivered);
                    r.total = Math.round(r.total);
                    r.delivered = Math.round(r.delivered);
                    r.rate = parseFloat(r.rate.toFixed(1));
                    r.ganRate = parseFloat(r.ganRate.toFixed(1));
                    if (!r.name.startsWith('(HBI)')) r.name = '(HBI) ' + r.name;
                    return r;
                });
            }
        }
        return { regions: allRegs, dailyRegions: dRegsProcessed, dailyGrandTotal: dGrandTotal };
    };

    const ca1Parsed = parseRegionsFromData(ca1Data);
    const ca2Parsed = parseRegionsFromData(ca2Data);

    MOCK_DATA.regionsCa1 = ca1Parsed.regions;
    MOCK_DATA.dailyRegionsCa1 = ca1Parsed.dailyRegions;
    MOCK_DATA.dailyGrandTotalCa1 = ca1Parsed.dailyGrandTotal;
    
    MOCK_DATA.regionsCa2 = ca2Parsed.regions;
    MOCK_DATA.dailyRegionsCa2 = ca2Parsed.dailyRegions;
    MOCK_DATA.dailyGrandTotalCa2 = ca2Parsed.dailyGrandTotal;

    // Debug: verify dates and GTC compare data
    console.log('[Data] Tổng số dòng:', mainData.length);
    console.log('[Data] Tất cả ngày (sorted):', allDates);
    console.log('[Data] Grand Total dates:', Object.keys(dailyGrandTotal).length);
    if (allDates.length >= 2) {
        const n1 = allDates[allDates.length - 1];
        const n2 = allDates[allDates.length - 2];
        console.log('[GTC Compare] N-1:', n1, '→', dailyGrandTotal[n1]);
        console.log('[GTC Compare] N-2:', n2, '→', dailyGrandTotal[n2]);
    }
    console.log('[Data] Regions:', regions.map(r => r.name));

    renderKPIs();
    populateDateSelector();
    renderTable();
    renderCharts();

    // Fetch Aging data then render compare table
    fetchAgingData().then(() => {
        renderCompareTable();
        document.getElementById('lastUpdate').innerText = "Cập nhật: " + new Date().toLocaleTimeString('vi-VN');
        const btn = document.getElementById('refreshBtn');
        if (btn) btn.classList.remove('spinning');
    });
}

function loadMockData() {
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('spinning');
    showLoadingState();
    fetchGoogleSheetData();
}

function renderKPIs() {
    const kpiWrap = document.getElementById('kpiOverview');
    if (!kpiWrap) return;

    const d = MOCK_DATA.overview;
    kpiWrap.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-ico">📦</div>
            <div class="kpi-label">Tổng Đơn Hàng</div>
            <div class="kpi-val">${fmt(d.totalOrders)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-ico" style="background:#D1FAE5; color:#059669">✅</div>
            <div class="kpi-label">Đã Giao</div>
            <div class="kpi-val" style="color:#059669">${fmt(d.delivered)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-ico" style="background:#FEF3C7; color:#B45309">⏳</div>
            <div class="kpi-label">Đang Giao</div>
            <div class="kpi-val">${fmt(d.pending)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-ico" style="background:#EFF4FE; color:#2563EB">📈</div>
            <div class="kpi-label">Tỉ lệ GTC</div>
            <div class="kpi-val" style="color:#2563EB">${d.successRate}%</div>
        </div>
    `;
}

/* ===== DATE SELECTOR & PER-DATE TABLE ===== */
function populateDateSelector() {
    const selector = document.getElementById('dateSelector');
    if (!selector) return;

    // Keep "Tất cả" option, add 8 most recent dates
    const recentDates = MOCK_DATA.allDates.slice(-8).reverse(); // newest first

    // Clear existing date options (keep first "all" option)
    while (selector.options.length > 1) {
        selector.remove(1);
    }

    recentDates.forEach(dateKey => {
        const opt = document.createElement('option');
        opt.value = dateKey;
        // Format: "2026-08-09 - Chủ Nhật" → "09/08/2026 (Chủ Nhật)"
        const parts = dateKey.split(' - ');
        const dateParts = parts[0].split('-'); // [2026, 08, 09]
        const formatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const dayName = parts.length > 1 ? ` (${parts[1].trim()})` : '';
        opt.textContent = `${formatted}${dayName}`;
        selector.appendChild(opt);
    });

    // Auto-select the most recent date
    if (recentDates.length > 0) {
        selector.value = recentDates[0];
        renderTableByDate(recentDates[0]);
    }
}

function renderTableByDate(dateKey) {
    let targetDates = [];
    if (dateKey === 'all') {
        targetDates = MOCK_DATA.allDates.slice(-3).reverse();
    } else {
        const idx = MOCK_DATA.allDates.indexOf(dateKey);
        if (idx !== -1) {
            targetDates.push(MOCK_DATA.allDates[idx]);
            if (idx - 1 >= 0) targetDates.push(MOCK_DATA.allDates[idx - 1]);
            if (idx - 2 >= 0) targetDates.push(MOCK_DATA.allDates[idx - 2]);
        }
    }

    const tableOv = document.querySelector('#dataTableOverview');
    if (tableOv) renderTableHorizontal(tableOv, targetDates, MOCK_DATA.dailyRegions, MOCK_DATA.regions);
    
    const tableCa1 = document.querySelector('#dataTableCa1');
    if (tableCa1) renderTableHorizontal(tableCa1, targetDates, MOCK_DATA.dailyRegionsCa1, MOCK_DATA.regionsCa1);
    
    const tableCa2 = document.querySelector('#dataTableCa2');
    if (tableCa2) renderTableHorizontal(tableCa2, targetDates, MOCK_DATA.dailyRegionsCa2, MOCK_DATA.regionsCa2);
}

function renderTableHorizontal(tableNode, targetDates, dailyRegionsData, allRegionsData) {
    let theadHtml = '<thead><tr>';
    theadHtml += '<th class="sticky-col" style="left:0; z-index:3; min-width: 40px; background: #FFF0E6;">STT</th>';
    theadHtml += '<th class="sticky-col" style="left:40px; z-index:3; min-width: 150px; background: #FFF0E6;">BƯU CỤC</th>';
    theadHtml += '<th class="sticky-col" style="left:190px; z-index:3; min-width: 120px; background: #FFF0E6; border-right: 1px solid #e2e8f0;">AM</th>';

    targetDates.forEach(dKey => {
        const parts = dKey.split(' - ');
        const dateParts = parts[0].split('-');
        let dayStr = parts.length > 1 ? parts[1].trim().toUpperCase() : '';
        if (dayStr === 'CHỦ NHẬT') dayStr = 'CN';
        const formatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} (${dayStr})`;
        theadHtml += `<th colspan="4" style="text-align:center; border-right: 1px solid #e2e8f0; background: #fff;">${formatted}</th>`;
    });
    theadHtml += '</tr><tr>';
    theadHtml += '<th class="sticky-col sub-header" style="left:0; z-index:3; background: #FFF0E6;"></th>';
    theadHtml += '<th class="sticky-col sub-header" style="left:40px; z-index:3; background: #FFF0E6;"></th>';
    theadHtml += '<th class="sticky-col sub-header" style="left:190px; z-index:3; background: #FFF0E6; border-right: 1px solid #e2e8f0;"></th>';

    targetDates.forEach(() => {
        theadHtml += '<th class="sub-header" style="min-width:60px; background: #fff;">VOL</th>';
        theadHtml += '<th class="sub-header" style="min-width:60px; background: #fff;">%GÁN</th>';
        theadHtml += '<th class="sub-header" style="min-width:75px; background: #fff;">%GTC</th>';
        theadHtml += '<th class="sub-header" style="min-width:60px; border-right: 1px solid #e2e8f0; background: #fff;">GTC</th>';
    });
    theadHtml += '</tr></thead>';

    let tbodyHtml = '<tbody>';
    let regionNames = [];
    if (targetDates.length > 0 && dailyRegionsData[targetDates[0]]) {
        regionNames = dailyRegionsData[targetDates[0]].map(r => r.name);
    } else if (allRegionsData && allRegionsData.length > 0) {
        regionNames = allRegionsData.map(r => r.name);
    }
    
    if (regionNames.length === 0) {
        tbodyHtml += `<tr><td colspan="${3 + targetDates.length * 4}" style="text-align:center; padding:24px;">Không có dữ liệu</td></tr>`;
    } else {
        regionNames.forEach((rName, idx) => {
            let amName = '';
            for (let dKey of targetDates) {
                let rData = dailyRegionsData[dKey] ? dailyRegionsData[dKey].find(r => r.name === rName) : null;
                if (rData && rData.am) {
                    amName = rData.am;
                    break;
                }
            }
            if (!amName && allRegionsData) {
                let rData = allRegionsData.find(r => r.name === rName);
                if (rData && rData.am) amName = rData.am;
            }

            tbodyHtml += '<tr>';
            tbodyHtml += `<td class="sticky-col" style="left:0; z-index:1; background: #fff; text-align:center; font-size:0.9em; color:var(--text-sub);">${idx + 1}</td>`;
            tbodyHtml += `<td class="sticky-col" style="left:40px; z-index:1; background: #fff; font-weight:600; color:var(--text-main);">${rName}</td>`;
            tbodyHtml += `<td class="sticky-col" style="left:190px; z-index:1; background: #fff; color:var(--text-sub); font-size:0.9em; border-right: 1px solid #e2e8f0;">${amName}</td>`;

            targetDates.forEach(dKey => {
                let rData = dailyRegionsData[dKey] ? dailyRegionsData[dKey].find(r => r.name === rName) : null;
                if (rData) {
                    let gtcCls = rData.rate >= 70 ? 'pill-g' : (rData.rate >= 50 ? 'pill-y' : 'pill-r');
                    let txtCls = rData.rate >= 70 ? 'txt-g' : (rData.rate >= 50 ? 'txt-y' : 'txt-r');
                    
                    tbodyHtml += `<td>${fmt(rData.total)}</td>`;
                    tbodyHtml += `<td>${rData.ganRate.toFixed(1)}%</td>`;
                    tbodyHtml += `<td><span class="pill ${gtcCls}">${rData.rate.toFixed(1)}%</span></td>`;
                    tbodyHtml += `<td style="border-right: 1px solid #e2e8f0; font-weight:700;" class="${txtCls}">${fmt(rData.gtcCount)}</td>`;
                } else {
                    tbodyHtml += `<td>-</td><td>-</td><td>-</td><td style="border-right: 1px solid #e2e8f0;">-</td>`;
                }
            });
            tbodyHtml += '</tr>';
        });
    }
    tbodyHtml += '</tbody>';
    
    tableNode.innerHTML = theadHtml + tbodyHtml;
}

function renderTable() {
    const selector = document.getElementById('dateSelector');
    if (selector) {
        renderTableByDate(selector.value);
    }
}

let volChartInst = null;
let ratioChartInst = null;

function renderCharts() {
    // Biểu đồ đã bị loại bỏ theo yêu cầu của user
}

/* ===== AGING DATA (from Aging sheet) ===== */
let AGING_DATA = { count: 0, date: '', history: {} };

async function fetchAgingData() {
    const agingUrl = 'https://docs.google.com/spreadsheets/d/1S296AhJ6MlXN1-JYFNzQG6Uu-35UN132ovHC4o8jGq4/export?format=csv&gid=1823144076';
    
    try {
        const result = await new Promise((resolve, reject) => {
            Papa.parse(agingUrl, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results),
                error: (err) => reject(err)
            });
        });

        const rows = result.data;
        const agingCount = rows.length;
        
        // Get today's date key (DD/MM/YYYY)
        const today = new Date();
        const todayKey = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

        // Load history from localStorage
        let history = {};
        try {
            const saved = localStorage.getItem('aging_history');
            if (saved) history = JSON.parse(saved);
        } catch(e) { history = {}; }

        // Save today's count
        history[todayKey] = agingCount;

        // Keep only last 30 days of history
        const keys = Object.keys(history).sort((a, b) => {
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
        });
        if (keys.length > 30) {
            keys.slice(0, keys.length - 30).forEach(k => delete history[k]);
        }

        // Save back to localStorage
        localStorage.setItem('aging_history', JSON.stringify(history));

        AGING_DATA = { count: agingCount, date: todayKey, history: history };

        console.log('[Aging] Hôm nay:', todayKey, '→', agingCount, 'đơn');
        console.log('[Aging] Lịch sử:', history);

    } catch (error) {
        console.error('[Aging] Lỗi tải dữ liệu Aging:', error);
    }
}

/* ===== COMPARE TABLE (N-1 vs N-2) ===== */

// Static data for non-GTC metrics (these come from different sheets)
const COMPARE_DATA_STATIC = [
    {
        name: 'FD Total',
        n1Date: '08/08/2026', n1Value: 5.93, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 6.01, n2Unit: '%',
        higherIsBetter: false, unit: '%'
    },
    {
        name: 'FD TTS',
        n1Date: '08/08/2026', n1Value: 4.51, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 3.69, n2Unit: '%',
        higherIsBetter: false, unit: '%'
    },
    {
        name: 'FD SME',
        n1Date: '08/08/2026', n1Value: 8.16, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 8.76, n2Unit: '%',
        higherIsBetter: false, unit: '%'
    },
    {
        name: 'FD Shopee',
        n1Date: '08/08/2026', n1Value: 4.97, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 5.12, n2Unit: '%',
        higherIsBetter: false, unit: '%'
    },
    {
        name: 'Rớt LC',
        n1Date: '28/07/2026', n1Value: 126, n1Unit: ' đơn',
        n2Date: '27/07/2026', n2Value: 198, n2Unit: ' đơn',
        higherIsBetter: false, unit: ' đơn'
    },
    {
        name: 'ODR TTS',
        n1Date: '08/08/2026', n1Value: 96.5, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 95.2, n2Unit: '%',
        higherIsBetter: true, unit: '%'
    },
    {
        name: 'OPR TTS',
        n1Date: '08/08/2026', n1Value: 96.5, n1Unit: '%',
        n2Date: '07/08/2026', n2Value: 97.5, n2Unit: '%',
        higherIsBetter: true, unit: '%'
    },
    {
        name: 'Leadtime KCT',
        n1Date: '08/08/2026', n1Value: 3.24, n1Unit: 'h',
        n2Date: '07/08/2026', n2Value: 3.14, n2Unit: 'h',
        higherIsBetter: false, unit: 'h'
    }
];

function buildCompareData() {
    // Build GTC row dynamically from the 2 most recent dates in the sheet
    const allDates = MOCK_DATA.allDates;
    const grandTotal = MOCK_DATA.dailyGrandTotal;

    let compareRows = [];

    if (allDates.length >= 2) {
        const n1DateKey = allDates[allDates.length - 1]; // newest
        const n2DateKey = allDates[allDates.length - 2]; // second newest

        // Format date: "2026-08-09 - Chủ Nhật" → "09/08/2026"
        const formatDate = (dateKey) => {
            const parts = dateKey.split(' - ')[0].split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        };

        const n1DateFmt = formatDate(n1DateKey);
        const n2DateFmt = formatDate(n2DateKey);

        // Function to create a comparison row
        const addRow = (title, grandTotalData) => {
            const n1GT = grandTotalData[n1DateKey];
            const n2GT = grandTotalData[n2DateKey];
            if (n1GT && n2GT) {
                const n1GtcPct = parseFloat((n1GT.gtcRate * 100).toFixed(1));
                const n2GtcPct = parseFloat((n2GT.gtcRate * 100).toFixed(1));
                compareRows.push({
                    name: title,
                    n1Date: n1DateFmt, n1Value: n1GtcPct, n1Unit: '%',
                    n2Date: n2DateFmt, n2Value: n2GtcPct, n2Unit: '%',
                    higherIsBetter: true, unit: '%',
                    isDynamic: true
                });
            }
        };

        addRow('GTC', MOCK_DATA.dailyGrandTotal);
        addRow('GTC ca 1, tồn', MOCK_DATA.dailyGrandTotalCa1);
        addRow('GTC ca 2', MOCK_DATA.dailyGrandTotalCa2);
    }

    // Build Aging >5N row dynamically
    if (AGING_DATA.count > 0) {
        const historyKeys = Object.keys(AGING_DATA.history).sort((a, b) => {
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            return new Date(ya, ma-1, da) - new Date(yb, mb-1, db);
        });

        const n1Key = historyKeys[historyKeys.length - 1]; // today (newest)
        const n1Val = AGING_DATA.history[n1Key];

        if (historyKeys.length >= 2) {
            // We have previous day data
            const n2Key = historyKeys[historyKeys.length - 2];
            const n2Val = AGING_DATA.history[n2Key];
            compareRows.push({
                name: 'Aging >5N',
                n1Date: n1Key, n1Value: n1Val, n1Unit: ' đơn',
                n2Date: n2Key, n2Value: n2Val, n2Unit: ' đơn',
                higherIsBetter: false, unit: ' đơn',
                isDynamic: true
            });
        } else {
            // First time — no previous data, show N-1 only
            compareRows.push({
                name: 'Aging >5N',
                n1Date: n1Key, n1Value: n1Val, n1Unit: ' đơn',
                n2Date: '—', n2Value: n1Val, n2Unit: ' đơn',
                higherIsBetter: false, unit: ' đơn',
                isDynamic: true
            });
        }
    }

    // Add static rows after dynamic ones
    return [...compareRows, ...COMPARE_DATA_STATIC];
}

function renderCompareTable() {
    const tbody = document.getElementById('compareTbody');
    if (!tbody) return;

    const COMPARE_DATA = buildCompareData();

    tbody.innerHTML = COMPARE_DATA.map(row => {
        const diff = row.n1Value - row.n2Value;
        const absDiff = Math.abs(diff);
        const isUp = diff > 0;
        const unitLabel = row.unit;

        // Format the diff value
        let diffDisplay;
        if (unitLabel === '%') {
            diffDisplay = absDiff.toFixed(1) + '%';
        } else if (unitLabel === 'h') {
            diffDisplay = absDiff.toFixed(2) + 'h';
        } else {
            diffDisplay = Math.round(absDiff) + ' ' + row.unit.trim();
        }

        // Determine if the change is "good" or "bad"
        let isGood;
        if (row.higherIsBetter) {
            isGood = isUp;
        } else {
            isGood = !isUp;
        }

        const direction = isUp ? 'tăng' : 'giảm';
        const changeClass = isGood ? (isUp ? 'change-up' : 'change-down') : (isUp ? 'change-up-bad' : 'change-down-bad');
        const evalDotClass = isGood ? 'good' : 'bad';
        const evalTextClass = isGood ? 'eval-text-good' : 'eval-text-bad';
        const evalLabel = isGood ? 'tốt' : 'tệ';

        // Format values for display
        const n1Display = unitLabel === '%' ? row.n1Value.toFixed(1) + '%'
            : unitLabel === 'h' ? row.n1Value.toFixed(2) + 'h'
                : Math.round(row.n1Value) + row.n1Unit;

        const n2Display = unitLabel === '%' ? row.n2Value.toFixed(1) + '%'
            : unitLabel === 'h' ? row.n2Value.toFixed(2) + 'h'
                : Math.round(row.n2Value) + row.n2Unit;

        // Add a highlight badge for dynamic (live) data
        const liveBadge = row.isDynamic ? ' <span class="live-badge">LIVE</span>' : '';

        return `
            <tr${row.isDynamic ? ' class="dynamic-row"' : ''}>
                <td class="metric-name">${row.name}${liveBadge}</td>
                <td class="date-cell">${row.n1Date}</td>
                <td class="value-cell">${n1Display}</td>
                <td class="date-cell">${row.n2Date}</td>
                <td class="value-cell">${n2Display}</td>
                <td class="change-cell ${changeClass}">${direction} ${diffDisplay} so N-1</td>
                <td>
                    <div class="eval-cell">
                        <span class="eval-dot ${evalDotClass}"></span>
                        <span class="${evalTextClass}">${evalLabel}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Update subtitle with dynamic date info
    const subtitle = document.getElementById('compareSubtitle');
    if (subtitle) {
        const allDates = MOCK_DATA.allDates;
        if (allDates.length >= 2) {
            const n1Key = allDates[allDates.length - 1];
            const n2Key = allDates[allDates.length - 2];
            const fmtD = (k) => { const p = k.split(' - ')[0].split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };
            subtitle.textContent = `GTC tự động cập nhật từ sheet · N-1: ${fmtD(n1Key)} · N-2: ${fmtD(n2Key)} · Các chỉ số khác: ngày mới nhất sheet riêng`;
        } else {
            subtitle.textContent = `Mỗi chỉ số: ngày mới nhất sheet riêng vs ngày kế trước`;
        }
    }
}

function copyCompareTable() {
    const COMPARE_DATA = buildCompareData();
    const rows = COMPARE_DATA.map(row => {
        const diff = row.n1Value - row.n2Value;
        const absDiff = Math.abs(diff);
        const isUp = diff > 0;
        const unitLabel = row.unit;

        let diffDisplay;
        if (unitLabel === '%') {
            diffDisplay = absDiff.toFixed(1) + '%';
        } else if (unitLabel === 'h') {
            diffDisplay = absDiff.toFixed(2) + 'h';
        } else {
            diffDisplay = Math.round(absDiff) + ' ' + row.unit.trim();
        }

        let isGood;
        if (row.higherIsBetter) {
            isGood = isUp;
        } else {
            isGood = !isUp;
        }

        const direction = isUp ? 'tăng' : 'giảm';
        const evalLabel = isGood ? '🟢 tốt' : '🔴 tệ';

        const n1Display = unitLabel === '%' ? row.n1Value.toFixed(1) + '%'
            : unitLabel === 'h' ? row.n1Value.toFixed(2) + 'h'
                : Math.round(row.n1Value) + row.n1Unit;

        const n2Display = unitLabel === '%' ? row.n2Value.toFixed(1) + '%'
            : unitLabel === 'h' ? row.n2Value.toFixed(2) + 'h'
                : Math.round(row.n2Value) + row.n2Unit;

        return `${row.name} | ${row.n1Date} | ${n1Display} | ${row.n2Date} | ${n2Display} | ${direction} ${diffDisplay} so N-1 | ${evalLabel}`;
    });

    const header = 'CHỈ SỐ | N-1 | GIÁ TRỊ N-1 | N-2 | GIÁ TRỊ N-2 | BIẾN ĐỘNG | ĐÁNH GIÁ';
    const separator = '---|---|---|---|---|---|---';
    const text = [header, separator, ...rows].join('\n');

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('compareCopyBtn');
        const btnText = document.getElementById('copyBtnText');
        if (btn && btnText) {
            btn.classList.add('copied');
            btnText.textContent = 'copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btnText.textContent = 'copy';
            }, 2000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}
