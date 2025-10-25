/* ----------- Section Toggle ----------- */
const sections = document.querySelectorAll('.section');
const links = document.querySelectorAll('.sidebar nav a');
links.forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        const sectionId = link.dataset.section + 'Section';
        sections.forEach(s => s.style.display = 'none');
        document.getElementById(sectionId).style.display = 'block';
        links.forEach(l => l.classList.remove('active'));
        links.forEach(l => {
            if(l.dataset.section === link.dataset.section && l.dataset.lang === link.dataset.lang){
                l.classList.add('active');
            }
        });
    });
});

/* ----------- Language Toggle ----------- */
const enBtn = document.getElementById('enBtn');
const viBtn = document.getElementById('viBtn');
enBtn.onclick = () => {
    document.querySelectorAll('[data-lang="en"]').forEach(e => e.style.display = 'block');
    document.querySelectorAll('[data-lang="vi"]').forEach(e => e.style.display = 'none');
    enBtn.classList.add('active'); 
    viBtn.classList.remove('active');
};
viBtn.onclick = () => {
    document.querySelectorAll('[data-lang="en"]').forEach(e => e.style.display = 'none');
    document.querySelectorAll('[data-lang="vi"]').forEach(e => e.style.display = 'block');
    viBtn.classList.add('active'); 
    enBtn.classList.remove('active');
};

/* ----------- WebSocket & Charts ----------- */
const socket = new WebSocket(`ws://${window.location.hostname}:3000`);
function createChart(ctx, label, color){
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: color,
                backgroundColor: color.replace('rgb','rgba').replace(')',',0.1)'),
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 0 },
            plugins: { legend: { display: true } },
            scales: {
                x: { title:{display:true,text:'Time (hh:mm:ss)'} },
                y: { beginAtZero: false }
            }
        }
    });
}

const currentChart = createChart(document.getElementById('currentChart').getContext('2d'), 'Current mA', 'rgb(39,174,96)');
const voltageChart = createChart(document.getElementById('voltageChart').getContext('2d'), 'Voltage V', 'rgb(41,128,185)');

let historyData = [];

/* ----------- Nhận dữ liệu realtime ----------- */
socket.onmessage = event => {
    const data = JSON.parse(event.data);
    const now = new Date();
    const timeLabel = now.getHours().toString().padStart(2, '0') + ':' +
    now.getMinutes().toString().padStart(2, '0') + ':' +
    now.getSeconds().toString().padStart(2, '0');





    document.getElementById("current").innerText = (typeof data.current === 'number') ? data.current.toFixed(3)+' mA' : "-- mA";
    document.getElementById("voltage").innerText = (typeof data.voltage === 'number') ? data.voltage.toFixed(2)+' V' : "-- V";

    historyData.push({time: timeLabel, current: data.current, voltage: data.voltage});
    if(historyData.length > 100) historyData.shift();
    const visibleData = historyData.slice(-20);

    updateChart(currentChart, visibleData.map(d=>d.current), visibleData.map(d=>d.time));
    updateChart(voltageChart, visibleData.map(d=>d.voltage), visibleData.map(d=>d.time));

    
    addLog(timeLabel, data.current, data.voltage);
};

function updateChart(chart, data, labels){
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

/* ----------- Nút Load ON/OFF ----------- */
const loadBtn = document.getElementById('loadToggleBtn');
let loadOn = true;
loadBtn.addEventListener('click', ()=>{
    loadOn = !loadOn;
    if(loadOn){
        loadBtn.innerText = "LOAD ON";
        loadBtn.classList.remove('off');
        socket.send(JSON.stringify({command:'toggle_load', state:'ON'}));
    } else {
        loadBtn.innerText = "LOAD OFF";
        loadBtn.classList.add('off');
        socket.send(JSON.stringify({command:'toggle_load', state:'OFF'}));
    }
});


/* ----------- Thêm log vào bảng ----------- */
function addLog(time, current, voltage){
    const tbody = document.querySelector("#logsTable tbody");
    const tr = document.createElement("tr");
    if(current>5) tr.classList.add("over-current");
    if(voltage<11||voltage>13) tr.classList.add("over-voltage");
    tr.innerHTML = `<td>${time}</td><td>${current.toFixed(3)}</td><td>${voltage.toFixed(2)}</td>`;
    tbody.prepend(tr);
}


document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  const currentValue = parseFloat(document.getElementById("currentThreshold").value);
  const vMin = parseFloat(document.getElementById("voltageMin").value);
  const vMax = parseFloat(document.getElementById("voltageMax").value);

  if (isNaN(currentValue) || isNaN(vMin) || isNaN(vMax)) {
    alert("Vui lòng nhập đầy đủ thông số");
    return;
  }
  if (vMin >= vMax) {
    alert("Voltage Min phải nhỏ hơn Voltage Max");
    return;
  }
  if (currentValue <= 0) {
    alert("Current Threshold phải lớn hơn 0");
    return;
  }

  // Gửi dữ liệu về server để lưu vào database
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current: currentValue,
      voltageMin: vMin,
      voltageMax: vMax
    })
  })
    .then((res) => res.json())
    .then((data) => {
      alert("Đã lưu cài đặt mới!");
      console.log("Server đã lưu:", data);
    })
    .catch((err) => {
      console.error("Lỗi khi lưu settings:", err);
      alert("Không thể lưu cài đặt.");
    });
});





/* ----------- Tự động load setting khi mở Dashboard ----------- */
window.addEventListener("load", () => {
  fetch("/api/settings")
    .then((res) => res.json())
    .then((data) => {
      if (data && Object.keys(data).length > 0) {
        // Gán giá trị từ database vào ô input
        document.getElementById("voltageMin").value = data.voltageMin || 2;
        document.getElementById("voltageMax").value = data.voltageMax || 10;
        document.getElementById("currentThreshold").value = data.current || 100;

        console.log("Loaded settings from DB:", data);
      } else {
        console.warn("Không có dữ liệu setting trong DB, dùng giá trị mặc định.");
      }
    })
    .catch((err) => console.error("Lỗi load settings:", err));
});
