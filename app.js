/* ===== NAV DATA ===== */
const NAV_GROUPS = [
    { id: 'g_ov', icon: '🗺️', label: 'Tổng quan', page: 'p0' },
    { id: 'g_gtc', icon: '📦', label: 'GTC', items: [['p1', '📊', '% GTC'], ['p2', '🛡️', 'TITAN TTS']] },
    { id: 'g_fd', icon: '🔄', label: 'FD', items: [['p3', '📅', 'FD Daily'], ['p4', '🗓️', 'FD Weekly']] },
    { id: 'g_ot', icon: '⏱️', label: 'Ontime', items: [['p5', '🛰️', 'ODR TTS'], ['p6', '🚀', 'OPR TTS']] },
    { id: 'g_hr', icon: '👥', label: 'Nhân sự', items: [['p10', '📋', 'Định biên'], ['p11', '📈', 'Năng suất']] },
    { id: 'g_ai', icon: '✨', label: 'AI', page: 'p12', cap: 'AI Analysis', cls: 'ai' }
];

const PAGE2GRP = {};
NAV_GROUPS.forEach(g => {
    if (g.page) PAGE2GRP[g.page] = g.id;
    (g.items || []).forEach(it => PAGE2GRP[it[0]] = g.id);
});

/* ===== INITIALIZATION ===== */
document.addEventListener("DOMContentLoaded", () => {
    buildNav();
    showLoadingState();
    loadMockData();
});

/* ===== NAVIGATION LOGIC ===== */
function buildNav() {
    const nb = document.getElementById('navbar');
    if (!nb) return;
    nb.innerHTML = NAV_GROUPS.map(g => {
        const hasDD = !!g.items;
        const onclick = hasDD ? `navOpen(event,'${g.id}')` : `nav('${g.page}','${g.id}')`;
        const caret = hasDD ? '<span class="nav-caret">▾</span>' : '';
        const cap = g.cap ? `<div class="nav-cap">${g.cap}</div>` : '';
        let dd = '';
        if (hasDD) {
            dd = `<div class="nav-dd">` + g.items.map(it => `<button class="dd-item" data-pg="${it[0]}" onclick="nav('${it[0]}','${g.id}')"><span class="dd-ico">${it[1]}</span>${it[2]}</button>`).join('') + `</div>`;
        }
        return `<div class="nav-pod${g.cls === 'ai' ? ' ai' : ''}" id="pod_${g.id}"><button class="nav-circle" onclick="${onclick}">${g.icon}${caret}</button><div class="nav-label">${g.label}</div>${cap}${dd}</div>`;
    }).join('');
    // Đặt tab đầu tiên là active
    nav('p0', 'g_ov');
}

function navOpen(e, grpId) {
    e.stopPropagation();
    const pod = document.getElementById('pod_' + grpId);
    if (!pod) return;
    const wasOpen = pod.classList.contains('open');
    document.querySelectorAll('.nav-pod.open').forEach(p => p.classList.remove('open'));
    if (!wasOpen) pod.classList.add('open');
}

function nav(id, grpId) {
    document.querySelectorAll('.nav-pod.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
    }

    grpId = grpId || PAGE2GRP[id];
    document.querySelectorAll('.nav-pod').forEach(p => p.classList.remove('cur'));
    document.querySelectorAll('.nav-circle').forEach(c => c.classList.remove('active'));

    const pod = document.getElementById('pod_' + grpId);
    if (pod) {
        pod.classList.add('cur');
        pod.querySelector('.nav-circle')?.classList.add('active');
    }
    document.querySelectorAll('.dd-item').forEach(d => d.classList.toggle('active', d.dataset.pg === id));
}

document.addEventListener('click', () => {
    document.querySelectorAll('.nav-pod.open').forEach(p => p.classList.remove('open'));
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

async function fetchGoogleSheetData() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/1S296AhJ6MlXN1-JYFNzQG6Uu-35UN132ovHC4o8jGq4/export?format=csv&gid=0';

    const startTime = performance.now();
    updateLoadingStatus('Đang tải dữ liệu từ Google Sheets...');

    try {
        Papa.parse(csvUrl, {
            download: true,
            header: true,
            skipEmptyLines: true,
            // NO worker: true — main thread parse is faster for ~200 rows
            complete: function (results) {
                const elapsed = Math.round(performance.now() - startTime);
                updateLoadingStatus(`Dữ liệu tải xong (${elapsed}ms), đang xử lý...`);
                console.log(`[Perf] Download + parse: ${elapsed}ms`);
                processData(results.data);
            },
            error: function (error) {
                console.error("Lỗi PapaParse:", error);
                const btn = document.getElementById('refreshBtn');
                if (btn) btn.classList.remove('spinning');
                updateLoadingStatus('❌ Lỗi tải dữ liệu. Thử lại?');
            }
        });
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        const btn = document.getElementById('refreshBtn');
        if (btn) btn.classList.remove('spinning');
        updateLoadingStatus('❌ Lỗi: ' + error.message);
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
            <tr><td colspan="5"><div class="skeleton-line" style="width:100%;height:14px;"></div></td></tr>
        `).join('');
    }
}

function updateLoadingStatus(msg) {
    const el = document.getElementById('lastUpdate');
    if (el) el.innerText = msg;
}

function processData(data) {
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

    MOCK_DATA.rawData = data;

    data.forEach(row => {
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
                regionMap[region] = { name: region, total: 0, delivered: 0, gan: 0 };
            }
            regionMap[region].total += vol;
            regionMap[region].delivered += deliv;
            regionMap[region].gan += gan;

            // Per-date region data
            if (!dailyRegions[time]) dailyRegions[time] = {};
            if (!dailyRegions[time][region]) {
                dailyRegions[time][region] = { name: region, total: 0, delivered: 0, gan: 0 };
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

    renderKPIs();
    populateDateSelector();
    renderTable();
    renderCharts();
    renderCompareTable();

    document.getElementById('lastUpdate').innerText = "Cập nhật: " + new Date().toLocaleTimeString('vi-VN');
    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.remove('spinning');
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
    const tbody = document.querySelector('#dataTableOverview tbody');
    if (!tbody) return;

    let regionsToRender;

    if (dateKey === 'all') {
        regionsToRender = MOCK_DATA.regions;
    } else {
        regionsToRender = MOCK_DATA.dailyRegions[dateKey] || [];
    }

    if (regionsToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-sub);">Không có dữ liệu cho ngày đã chọn</td></tr>`;
        return;
    }

    tbody.innerHTML = regionsToRender.map(r => {
        let gtcCls = r.rate >= 93 ? 'g' : (r.rate >= 72 ? 'm' : 'b');
        let ganCls = r.ganRate >= 95 ? 'g' : (r.ganRate >= 85 ? 'm' : 'b');
        return `
            <tr>
                <td style="font-weight:600">${r.name}</td>
                <td>${fmt(r.total)}</td>
                <td><span class="pct ${ganCls}">${r.ganRate}%</span></td>
                <td><span class="pct ${gtcCls}">${r.rate}%</span></td>
                <td>${fmt(r.gtcCount)}</td>
            </tr>
        `;
    }).join('');
}

function renderTable() {
    // Default: render by the currently selected date
    const selector = document.getElementById('dateSelector');
    if (selector) {
        renderTableByDate(selector.value);
    } else {
        // Fallback: render all aggregated
        const tbody = document.querySelector('#dataTableOverview tbody');
        if (!tbody) return;

        tbody.innerHTML = MOCK_DATA.regions.map(r => {
            let gtcCls = r.rate >= 93 ? 'g' : (r.rate >= 72 ? 'm' : 'b');
            let ganCls = r.ganRate >= 95 ? 'g' : (r.ganRate >= 85 ? 'm' : 'b');
            return `
                <tr>
                    <td style="font-weight:600">${r.name}</td>
                    <td>${fmt(r.total)}</td>
                    <td><span class="pct ${ganCls}">${r.ganRate}%</span></td>
                    <td><span class="pct ${gtcCls}">${r.rate}%</span></td>
                    <td>${fmt(r.gtcCount)}</td>
                </tr>
            `;
        }).join('');
    }
}

let volChartInst = null;
let ratioChartInst = null;

function renderCharts() {
    const ctxVol = document.getElementById('volChart');
    const ctxRatio = document.getElementById('ratioChart');

    if (ctxVol && window.Chart) {
        if (volChartInst) volChartInst.destroy();
        volChartInst = new Chart(ctxVol, {
            type: 'bar',
            data: {
                labels: MOCK_DATA.chartLabels,
                datasets: [{
                    label: 'Sản lượng (đơn)',
                    data: MOCK_DATA.chartVol,
                    backgroundColor: '#3B82F6',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#E6E9EF' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    if (ctxRatio && window.Chart) {
        if (ratioChartInst) ratioChartInst.destroy();
        ratioChartInst = new Chart(ctxRatio, {
            type: 'doughnut',
            data: {
                labels: MOCK_DATA.regions.map(r => r.name),
                datasets: [{
                    data: MOCK_DATA.regions.map(r => r.total),
                    backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }
                }
            }
        });
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
        name: 'Aging >5N',
        n1Date: '09/08/2026', n1Value: 35, n1Unit: ' đơn',
        n2Date: '08/08/2026', n2Value: 15, n2Unit: ' đơn',
        higherIsBetter: false, unit: ' đơn'
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

        const n1GT = grandTotal[n1DateKey];
        const n2GT = grandTotal[n2DateKey];

        if (n1GT && n2GT) {
            // Format date: "2026-08-09 - Chủ Nhật" → "09/08/2026"
            const formatDate = (dateKey) => {
                const parts = dateKey.split(' - ')[0].split('-');
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            };

            const n1GtcPct = parseFloat((n1GT.gtcRate * 100).toFixed(1));
            const n2GtcPct = parseFloat((n2GT.gtcRate * 100).toFixed(1));

            compareRows.push({
                name: 'GTC',
                n1Date: formatDate(n1DateKey), n1Value: n1GtcPct, n1Unit: '%',
                n2Date: formatDate(n2DateKey), n2Value: n2GtcPct, n2Unit: '%',
                higherIsBetter: true, unit: '%',
                isDynamic: true
            });
        }
    }

    // Add static rows after GTC
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
