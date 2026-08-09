/* ===== NAV DATA ===== */
const NAV_GROUPS = [
    { id: 'g_ov', icon: '🗺️', label: 'Tổng quan', page: 'p0' },
    { id: 'g_gtc', icon: '📦', label: 'GTC', items: [['p1','📊','% GTC'],['p2','🛡️','TITAN TTS']] },
    { id: 'g_fd', icon: '🔄', label: 'FD', items: [['p3','📅','FD Daily'],['p4','🗓️','FD Weekly']] },
    { id: 'g_ot', icon: '⏱️', label: 'Ontime', items: [['p5','🛰️','ODR TTS'],['p6','🚀','OPR TTS']] },
    { id: 'g_hr', icon: '👥', label: 'Nhân sự', items: [['p10','📋','Định biên'],['p11','📈','Năng suất']] },
    { id: 'g_ai', icon: '✨', label: 'AI', page: 'p12', cap: 'AI Analysis', cls: 'ai' }
];

const PAGE2GRP = {};
NAV_GROUPS.forEach(g => {
    if(g.page) PAGE2GRP[g.page] = g.id;
    (g.items || []).forEach(it => PAGE2GRP[it[0]] = g.id);
});

/* ===== INITIALIZATION ===== */
document.addEventListener("DOMContentLoaded", () => {
    buildNav();
    // Simulate initial load
    setTimeout(() => {
        loadMockData();
    }, 500);
});

/* ===== NAVIGATION LOGIC ===== */
function buildNav() {
    const nb = document.getElementById('navbar');
    if(!nb) return;
    nb.innerHTML = NAV_GROUPS.map(g => {
        const hasDD = !!g.items;
        const onclick = hasDD ? `navOpen(event,'${g.id}')` : `nav('${g.page}','${g.id}')`;
        const caret = hasDD ? '<span class="nav-caret">▾</span>' : '';
        const cap = g.cap ? `<div class="nav-cap">${g.cap}</div>` : '';
        let dd = '';
        if(hasDD) {
            dd = `<div class="nav-dd">` + g.items.map(it => `<button class="dd-item" data-pg="${it[0]}" onclick="nav('${it[0]}','${g.id}')"><span class="dd-ico">${it[1]}</span>${it[2]}</button>`).join('') + `</div>`;
        }
        return `<div class="nav-pod${g.cls === 'ai' ? ' ai' : ''}" id="pod_${g.id}"><button class="nav-circle" onclick="${onclick}">${g.icon}${caret}</button><div class="nav-label">${g.label}</div>${cap}${dd}</div>`;
    }).join('');
    // Đặt tab đầu tiên là active
    nav('p0', 'g_ov');
}

function navOpen(e, grpId) {
    e.stopPropagation();
    const pod = document.getElementById('pod_'+grpId);
    if(!pod) return;
    const wasOpen = pod.classList.contains('open');
    document.querySelectorAll('.nav-pod.open').forEach(p => p.classList.remove('open'));
    if(!wasOpen) pod.classList.add('open');
}

function nav(id, grpId) {
    document.querySelectorAll('.nav-pod.open').forEach(p => p.classList.remove('open'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if(el) {
        el.classList.add('active');
    }
    
    grpId = grpId || PAGE2GRP[id];
    document.querySelectorAll('.nav-pod').forEach(p => p.classList.remove('cur'));
    document.querySelectorAll('.nav-circle').forEach(c => c.classList.remove('active'));
    
    const pod = document.getElementById('pod_'+grpId);
    if(pod) {
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
    if(splash) splash.classList.add('fade-out');
}

/* ===== MOCK DATA & RENDER ===== */
function fmt(n) { return (+n || 0).toLocaleString('vi-VN'); }

let MOCK_DATA = {
    overview: { totalOrders: 0, delivered: 0, pending: 0, successRate: 0, returnRate: 0 },
    chartVol: [],
    chartLabels: [],
    regions: []
};

async function fetchGoogleSheetData() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/1x1CtDHpcRxYJNcVUaujE-d5_IF2alvv5vSaQQdAXdZg/export?format=csv&gid=0';
    try {
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processData(results.data);
            }
        });
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu từ Google Sheets:", error);
        const btn = document.getElementById('refreshBtn');
        if(btn) btn.classList.remove('spinning');
    }
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

    data.forEach(row => {
        let isGrandTotal = (row['Chi tiết'] === 'Grand Total' || !row['Cấp Quản Lý'] || !row['Cấp Quản Lý'].trim());
        let time = row['Time'];
        let vol = parseNum(row['Volume']);
        let gtcRate = parseNum(row['% GTC']);
        let returnRate = parseNum(row['% Chuyển trả']);
        
        let deliv = vol * gtcRate;
        let ret = vol * returnRate;

        if (isGrandTotal && time) {
            totalOrders += vol;
            delivered += deliv;
            returned += ret;
            
            if (!dailyVols[time]) dailyVols[time] = 0;
            dailyVols[time] += vol;
        } else if (!isGrandTotal) {
            let region = row['Chi tiết'];
            if (!region) return;
            if (!regionMap[region]) {
                regionMap[region] = { name: region, total: 0, delivered: 0, pending: 0 };
            }
            regionMap[region].total += vol;
            regionMap[region].delivered += deliv;
        }
    });

    let successRate = totalOrders ? (delivered / totalOrders * 100) : 0;
    let retRate = totalOrders ? (returned / totalOrders * 100) : 0;
    let pending = totalOrders - delivered - returned;

    let timeKeys = Object.keys(dailyVols).sort();
    timeKeys = timeKeys.slice(-7); // Lấy 7 ngày gần nhất
    let chartLabels = timeKeys.map(t => {
        let parts = t.split(' - ');
        return parts.length > 1 ? parts[1] : t;
    });
    let chartVol = timeKeys.map(t => Math.round(dailyVols[t]));

    let regions = Object.values(regionMap).map(r => {
        r.rate = r.total ? (r.delivered / r.total * 100) : 0;
        r.pending = r.total - r.delivered; // approximate pending
        r.total = Math.round(r.total);
        r.delivered = Math.round(r.delivered);
        r.pending = Math.round(r.pending);
        r.rate = parseFloat(r.rate.toFixed(1));
        return r;
    });

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

    renderKPIs();
    renderTable();
    renderCharts();
    
    document.getElementById('lastUpdate').innerText = "Cập nhật: " + new Date().toLocaleTimeString('vi-VN');
    const btn = document.getElementById('refreshBtn');
    if(btn) btn.classList.remove('spinning');
}

function loadMockData() {
    const btn = document.getElementById('refreshBtn');
    if(btn) btn.classList.add('spinning');
    
    fetchGoogleSheetData();
}

function renderKPIs() {
    const kpiWrap = document.getElementById('kpiOverview');
    if(!kpiWrap) return;
    
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

function renderTable() {
    const tbody = document.querySelector('#dataTableOverview tbody');
    if(!tbody) return;
    
    tbody.innerHTML = MOCK_DATA.regions.map(r => {
        let cls = r.rate >= 93 ? 'g' : (r.rate >= 90 ? 'm' : 'b');
        let status = r.rate >= 93 ? 'Tốt' : (r.rate >= 90 ? 'Khá' : 'Cần Cải Thiện');
        return `
            <tr>
                <td style="font-weight:600">${r.name}</td>
                <td>${fmt(r.total)}</td>
                <td>${fmt(r.delivered)}</td>
                <td>${fmt(r.pending)}</td>
                <td><span class="pct ${cls}">${r.rate}%</span></td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');
}

let volChartInst = null;
let ratioChartInst = null;

function renderCharts() {
    const ctxVol = document.getElementById('volChart');
    const ctxRatio = document.getElementById('ratioChart');
    
    if(ctxVol && window.Chart) {
        if(volChartInst) volChartInst.destroy();
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

    if(ctxRatio && window.Chart) {
        if(ratioChartInst) ratioChartInst.destroy();
        ratioChartInst = new Chart(ctxRatio, {
            type: 'doughnut',
            data: {
                labels: MOCK_DATA.regions.map(r => r.name),
                datasets: [{
                    data: MOCK_DATA.regions.map(r => r.total),
                    backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'],
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
