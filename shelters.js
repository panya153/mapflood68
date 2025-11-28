// 👉 URL Web App (JSON) ของ Google Apps Script สำหรับ "ศูนย์พักพิง"
// ให้เปลี่ยนเป็น URL จริงของไฟล์ Shelters (ไม่ใช่ของโรงครัวกลาง)
const SHELTERS_API_URL =
  "https://script.google.com/macros/s/AKfycby07YqY45xDPgbekG69Z1ZuOhqjGVGMdSSmgOgZgwXASzDnGcug63CIMdwLNLQKHCECbw/exec"; // TODO: ใส่ URL จริง

let map;
let markersLayer;
let allShelters = [];
let currentMarkers = [];
let selectedMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEvents();
  loadShelterData();
});

function initMap() {
  // แผนที่เริ่มต้นตรงกลางประเทศไทย
  map = L.map("map", {
    zoomControl: true,
    fullscreenControl: true,
  }).setView([16.5, 100.5], 6);

  // พื้นหลังดาวเทียม Esri
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, " +
        "Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    }
  ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function initEvents() {
  const searchInput = document.getElementById("search-input");
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const statusSelect = document.getElementById("filter-status");
  const btnReset = document.getElementById("btn-reset");
  const btnLocate = document.getElementById("btn-locate");

  searchInput.addEventListener("input", applyFilters);

  provinceSelect.addEventListener("change", () => {
    updateDistrictOptions();
    applyFilters();
  });

  districtSelect.addEventListener("change", applyFilters);
  statusSelect.addEventListener("change", applyFilters);

  btnReset.addEventListener("click", () => {
    searchInput.value = "";
    provinceSelect.value = "";
    districtSelect.innerHTML = `<option value="">ทุกอำเภอ</option>`;
    statusSelect.value = "";
    applyFilters();
  });

  btnLocate.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("เบราว์เซอร์นี้ไม่รองรับการขอตำแหน่งปัจจุบัน");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 12);
        L.circleMarker([latitude, longitude], {
          radius: 6,
          color: "#0284c7",
          weight: 2,
          fillOpacity: 0.4,
        })
          .addTo(map)
          .bindPopup("ตำแหน่งของคุณ (โดยประมาณ)");
      },
      (err) => {
        console.error(err);
        alert("ไม่สามารถดึงตำแหน่งปัจจุบันได้");
      }
    );
  });
}

async function loadShelterData() {
  const statusText = document.getElementById("status-text");

  try {
    statusText.textContent = "กำลังโหลดข้อมูลศูนย์พักพิงจาก Google Sheets...";
    statusText.className = "badge-value badge-loading";

    console.log("เรียก SHELTERS_API_URL:", SHELTERS_API_URL);

    const res = await fetch(SHELTERS_API_URL);
    console.log("สถานะตอบกลับ:", res.status, res.statusText);

    if (!res.ok) {
      throw new Error("HTTP Error: " + res.status + " " + res.statusText);
    }

    const text = await res.text();
    console.log("ข้อความดิบจาก Shelters API:", text);

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("แปลง JSON Shelters ไม่ได้:", e);
      throw new Error("ข้อมูลศูนย์พักพิงที่ได้ไม่ใช่ JSON ที่ถูกต้อง");
    }

    // รองรับทั้ง [ ... ], {data:[...]}, {records:[...]}
    let data;
    if (Array.isArray(json)) {
      data = json;
    } else if (Array.isArray(json.data)) {
      data = json.data;
    } else if (Array.isArray(json.records)) {
      data = json.records;
    } else {
      console.error("โครงสร้าง JSON Shelters ไม่ตรงที่คาด:", json);
      throw new Error("โครงสร้าง JSON Shelters ไม่ถูกต้อง (ไม่มี array)");
    }

    // map field + กรองเฉพาะที่มีพิกัด
    allShelters = data
      .map((row) => {
        const province = row.Province || row.province || row["จังหวัด"] || "";
        const district = row.District || row.district || row["อำเภอ"] || "";

        return {
          raw: row,
          Province: province,
          District: district,
          id: row.id || row.ID || row.Id,
          name: row.name || row["name"],
          location: row.location || row["location"],
          status: row.status || row["status"],
          area: row.area || row["area"],
          contact_1_name: row.contact_1_name || row["contact_1_name"],
          contact_1_phone: row.contact_1_phone || row["contact_1_phone"],
          contact_2_name: row.contact_2_name || row["contact_2_name"],
          contact_2_phone: row.contact_2_phone || row["contact_2_phone"],
          contact_3_name: row.contact_3_name || row["contact_3_name"],
          contact_3_phone: row.contact_3_phone || row["contact_3_phone"],
          contact_4_name: row.contact_4_name || row["contact_4_name"],
          contact_4_phone: row.contact_4_phone || row["contact_4_phone"],
          Latitude: parseFloat(row.Latitude || row.latitude),
          Longitude: parseFloat(row.Longitude || row.longitude),
          googleMap: row["google map"] || row.google_map || row.GoogleMap,
          ref: row.ref || row["ref"],
        };
      })
      .filter(
        (s) =>
          !isNaN(s.Latitude) &&
          !isNaN(s.Longitude) &&
          s.Latitude !== 0 &&
          s.Longitude !== 0
      );

    console.log("จำนวนศูนย์พักพิงที่มีพิกัด:", allShelters.length);

    populateFilterOptions();
    applyFilters();

    statusText.textContent = "โหลดข้อมูลศูนย์พักพิงสำเร็จ";
    statusText.className = "badge-value badge-success";
  } catch (err) {
    console.error("เกิดข้อผิดพลาดใน loadShelterData():", err);
    statusText.textContent = "โหลดข้อมูลศูนย์พักพิงไม่สำเร็จ";
    statusText.className = "badge-value badge-error";
    alert(
      "ไม่สามารถโหลดข้อมูลศูนย์พักพิงจาก Google Sheets ได้\n" +
        "ลองเปิด Developer Tools (F12) แล้วดูแท็บ Console/Network เพื่อดูรายละเอียดเพิ่มเติม"
    );
  }
}

function populateFilterOptions() {
  const provinceSelect = document.getElementById("filter-province");
  const statusSelect = document.getElementById("filter-status");

  const provinces = [...new Set(allShelters.map((s) => s.Province || ""))]
    .filter((x) => x)
    .sort((a, b) => a.localeCompare(b, "th"));

  provinceSelect.innerHTML = `<option value="">ทุกจังหวัด</option>`;
  provinces.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });

  const statuses = [...new Set(allShelters.map((s) => s.status || ""))]
    .filter((x) => x)
    .sort((a, b) => a.localeCompare(b, "th"));

  statusSelect.innerHTML = `<option value="">ทุกสถานะ</option>`;
  statuses.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    statusSelect.appendChild(opt);
  });
}

function updateDistrictOptions() {
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const selectedProvince = provinceSelect.value;

  let filtered = allShelters;
  if (selectedProvince) {
    filtered = filtered.filter((s) => s.Province === selectedProvince);
  }

  const districts = [...new Set(filtered.map((s) => s.District || ""))]
    .filter((x) => x)
    .sort((a, b) => a.localeCompare(b, "th"));

  districtSelect.innerHTML = `<option value="">ทุกอำเภอ</option>`;
  districts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    districtSelect.appendChild(opt);
  });
}

function applyFilters() {
  if (!allShelters.length) return;

  const searchInput = document.getElementById("search-input");
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const statusSelect = document.getElementById("filter-status");

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedProvince = provinceSelect.value;
  const selectedDistrict = districtSelect.value;
  const selectedStatus = statusSelect.value;

  let filtered = allShelters;

  if (selectedProvince) {
    filtered = filtered.filter((s) => s.Province === selectedProvince);
  }
  if (selectedDistrict) {
    filtered = filtered.filter((s) => s.District === selectedDistrict);
  }
  if (selectedStatus) {
    filtered = filtered.filter((s) => (s.status || "") === selectedStatus);
  }

  if (searchTerm) {
    filtered = filtered.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const loc = (s.location || "").toLowerCase();
      const c1 = (s.contact_1_name || "").toLowerCase();
      const c2 = (s.contact_2_name || "").toLowerCase();
      const c3 = (s.contact_3_name || "").toLowerCase();
      const c4 = (s.contact_4_name || "").toLowerCase();
      return (
        name.includes(searchTerm) ||
        loc.includes(searchTerm) ||
        c1.includes(searchTerm) ||
        c2.includes(searchTerm) ||
        c3.includes(searchTerm) ||
        c4.includes(searchTerm)
      );
    });
  }

  updateStats(filtered);
  renderMarkers(filtered);
  renderList(filtered);
}

function updateStats(filtered) {
  const totalEl = document.getElementById("stat-total");
  const visibleEl = document.getElementById("stat-visible");
  const listCountEl = document.getElementById("list-count");

  totalEl.textContent = allShelters.length.toString();
  visibleEl.textContent = filtered.length.toString();
  listCountEl.textContent = `${filtered.length} แห่ง`;
}

function renderMarkers(filtered) {
  markersLayer.clearLayers();
  currentMarkers = [];
  selectedMarker = null;

  if (!filtered.length) return;

  const icon = L.icon({
    iconUrl: "icons/shelter.svg", // เตรียมไฟล์ไอคอนของศูนย์พักพิงเอง (ถ้าไม่มี Leaflet จะ error)
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -28],
  });

  const bounds = [];

  filtered.forEach((shelter) => {
    const { Latitude, Longitude } = shelter;
    const lat = Latitude;
    const lng = Longitude;

    const contactsHtml = buildContactsHtml(shelter);
    const statusHtml = shelter.status
      ? `<div style="font-size:12px;margin-bottom:4px;">
           สถานะ: <strong>${escapeHtml(shelter.status)}</strong>
         </div>`
      : "";

    const popupHtml = `
      <div style="min-width: 230px">
        <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(
          shelter.name || "-"
        )}</div>
        <div style="font-size:12px;color:#e5e7eb;margin-bottom:4px;">
          ${escapeHtml(shelter.District || "-")}, ${escapeHtml(
      shelter.Province || "-"
    )}
        </div>
        ${
          shelter.location
            ? `<div style="font-size:12px;margin-bottom:4px;">
                 พื้นที่: ${escapeHtml(shelter.location)}
               </div>`
            : ""
        }
        ${statusHtml}
        ${contactsHtml}
        ${
          shelter.googleMap
            ? `<a href="${escapeAttr(
                shelter.googleMap
              )}" target="_blank" rel="noopener" style="font-size:12px;">
                 เปิดตำแหน่งใน Google Maps
               </a><br/>`
            : ""
        }
        ${
          shelter.ref
            ? `<span style="font-size:11px;color:#9ca3af;">แหล่งที่มา: ${escapeHtml(
                shelter.ref
              )}</span>`
            : ""
        }
      </div>
    `;

    const marker = L.marker([lat, lng], { icon }).bindPopup(popupHtml);

    marker.addTo(markersLayer);

    currentMarkers.push({ marker, data: shelter });
    bounds.push([lat, lng]);
  });

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [30, 30] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  }
}

function renderList(filtered) {
  const listEl = document.getElementById("center-list");
  listEl.innerHTML = "";

  filtered.forEach((shelter) => {
    const card = document.createElement("div");
    card.className = "center-card";

    const contactLine = buildContactLineShort(shelter);

    card.innerHTML = `
      <div class="center-name">${escapeHtml(
        shelter.name || "ไม่ระบุชื่อศูนย์"
      )}</div>
      <div class="center-location">
        ${escapeHtml(shelter.location || "-")}
      </div>
      <div class="center-detail">
        ${escapeHtml(shelter.District || "-")}, ${escapeHtml(
      shelter.Province || "-"
    )}
      </div>
      ${
        shelter.status
          ? `<div class="center-meta">
               สถานะ: <strong>${escapeHtml(shelter.status)}</strong>
             </div>`
          : ""
      }
      ${
        contactLine
          ? `<div class="center-meta">
               ${contactLine}
             </div>`
          : ""
      }
    `;

    card.addEventListener("click", () => {
      focusOnShelter(shelter);
      highlightCard(card);
    });

    listEl.appendChild(card);
  });
}

function focusOnShelter(shelter) {
  const cm = currentMarkers.find((m) => m.data === shelter);
  if (!cm) return;

  const { marker } = cm;
  const latLng = marker.getLatLng();
  map.setView(latLng, 15, { animate: true });

  if (selectedMarker && selectedMarker !== marker) {
    selectedMarker.closePopup();
  }

  selectedMarker = marker;
  marker.openPopup();
}

function highlightCard(card) {
  document
    .querySelectorAll(".center-card")
    .forEach((c) => c.classList.remove("active"));
  card.classList.add("active");
}

function buildContactsHtml(s) {
  const lines = [];

  if (s.contact_1_name || s.contact_1_phone) {
    lines.push(
      `• ${escapeHtml(s.contact_1_name || "ผู้ประสานงาน 1")}: ${escapeHtml(
        s.contact_1_phone || "-"
      )}`
    );
  }
  if (s.contact_2_name || s.contact_2_phone) {
    lines.push(
      `• ${escapeHtml(s.contact_2_name || "ผู้ประสานงาน 2")}: ${escapeHtml(
        s.contact_2_phone || "-"
      )}`
    );
  }
  if (s.contact_3_name || s.contact_3_phone) {
    lines.push(
      `• ${escapeHtml(s.contact_3_name || "ผู้ประสานงาน 3")}: ${escapeHtml(
        s.contact_3_phone || "-"
      )}`
    );
  }
  if (s.contact_4_name || s.contact_4_phone) {
    lines.push(
      `• ${escapeHtml(s.contact_4_name || "ผู้ประสานงาน 4")}: ${escapeHtml(
        s.contact_4_phone || "-"
      )}`
    );
  }

  if (!lines.length) return "";

  return `
    <div style="font-size:12px;margin-bottom:4px;">
      <div style="font-weight:600;margin-bottom:2px;">ผู้ประสานงานศูนย์:</div>
      ${lines.map((l) => `<div>${l}</div>`).join("")}
    </div>
  `;
}

function buildContactLineShort(s) {
  if (s.contact_1_name || s.contact_1_phone) {
    return `ผู้ประสานงานหลัก: ${escapeHtml(
      s.contact_1_name || "-"
    )} (${escapeHtml(s.contact_1_phone || "-")})`;
  }
  return "";
}

/* Helper ป้องกัน XSS เบื้องต้น */
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  if (str == null) return "";
  return String(str).replace(/"/g, "&quot;");
}
