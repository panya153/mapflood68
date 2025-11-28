// 👉 URL Web App จาก Google Apps Script ของคุณ
const API_URL =
  "https://script.google.com/macros/s/AKfycbze94fwwzH5JxO11yqX1qFK4utLaB9Oaxqw7oy_0C4PrtjHlDxf_iVkq0YOYbfRvvrr/exec";

let map;
let markersLayer;
let allCenters = [];
let currentMarkers = [];
let selectedMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEvents();
  loadData();
});

function initMap() {
  // แผนที่เริ่มต้นตรงกลางประเทศไทย
  map = L.map("map", {
    zoomControl: true,
    fullscreenControl: true, // ปุ่มขยายเต็มจอ
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

  // (ถ้าอยากซ้อนชื่อเมือง/ถนนจาก Esri ด้วย เพิ่มอีก tileLayer ได้)
  // L.tileLayer(
  //   "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  //   { maxZoom: 19 }
  // ).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function initEvents() {
  const searchInput = document.getElementById("search-input");
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const subdistrictSelect = document.getElementById("filter-subdistrict");
  const btnReset = document.getElementById("btn-reset");
  const btnLocate = document.getElementById("btn-locate");

  searchInput.addEventListener("input", applyFilters);

  provinceSelect.addEventListener("change", () => {
    updateDistrictOptions();
    updateSubdistrictOptions();
    applyFilters();
  });

  districtSelect.addEventListener("change", () => {
    updateSubdistrictOptions();
    applyFilters();
  });

  subdistrictSelect.addEventListener("change", applyFilters);

  btnReset.addEventListener("click", () => {
    searchInput.value = "";
    provinceSelect.value = "";
    districtSelect.innerHTML = `<option value="">ทุกอำเภอ</option>`;
    subdistrictSelect.innerHTML = `<option value="">ทุกตำบล</option>`;
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

async function loadData() {
  const statusText = document.getElementById("status-text");

  try {
    statusText.textContent = "กำลังโหลดข้อมูล";
    statusText.className = "badge-value badge-loading";

    console.log("เรียก API_URL:", API_URL);

    const res = await fetch(API_URL);
    console.log("สถานะตอบกลับ:", res.status, res.statusText);

    if (!res.ok) {
      throw new Error("HTTP Error: " + res.status + " " + res.statusText);
    }

    const text = await res.text();
    console.log("ข้อความดิบจาก API:", text);

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error("แปลง JSON ไม่ได้:", e);
      throw new Error("ข้อมูลที่ได้ไม่ใช่ JSON ที่ถูกต้อง");
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
      console.error("โครงสร้าง JSON ไม่ตรงที่คาด:", json);
      throw new Error("โครงสร้าง JSON ไม่ถูกต้อง (ไม่มี array)");
    }

    allCenters = data
      .map((row) => ({
        ...row,
        Latitude: parseFloat(row.Latitude),
        Longitude: parseFloat(row.Longitude),
      }))
      .filter(
        (row) =>
          !isNaN(row.Latitude) &&
          !isNaN(row.Longitude) &&
          row.Latitude !== 0 &&
          row.Longitude !== 0
      );

    console.log("จำนวน record ที่มีพิกัด:", allCenters.length);

    populateFilterOptions();
    applyFilters();

    statusText.textContent = "โหลดข้อมูลสำเร็จ";
    statusText.className = "badge-value badge-success";
  } catch (err) {
    console.error("เกิดข้อผิดพลาดใน loadData():", err);
    statusText.textContent = "โหลดข้อมูลไม่สำเร็จ";
    statusText.className = "badge-value badge-error";
    alert(
      "ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้\n" +
        "ลองเปิด Developer Tools (F12) แล้วดูแท็บ Console/Network เพื่อดูรายละเอียดเพิ่มเติม"
    );
  }
}

function populateFilterOptions() {
  const provinceSelect = document.getElementById("filter-province");

  const provinces = [...new Set(allCenters.map((c) => c.Province || ""))]
    .filter((x) => x)
    .sort((a, b) => a.localeCompare(b, "th"));

  provinceSelect.innerHTML = `<option value="">ทุกจังหวัด</option>`;
  provinces.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    provinceSelect.appendChild(opt);
  });
}

function updateDistrictOptions() {
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const selectedProvince = provinceSelect.value;

  let filtered = allCenters;
  if (selectedProvince) {
    filtered = filtered.filter((c) => c.Province === selectedProvince);
  }

  const districts = [...new Set(filtered.map((c) => c.District || ""))]
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

function updateSubdistrictOptions() {
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const subdistrictSelect = document.getElementById("filter-subdistrict");
  const selectedProvince = provinceSelect.value;
  const selectedDistrict = districtSelect.value;

  let filtered = allCenters;
  if (selectedProvince) {
    filtered = filtered.filter((c) => c.Province === selectedProvince);
  }
  if (selectedDistrict) {
    filtered = filtered.filter((c) => c.District === selectedDistrict);
  }

  const subdistricts = [
    ...new Set(filtered.map((c) => c.Subdistrict || "")),
  ]
    .filter((x) => x)
    .sort((a, b) => a.localeCompare(b, "th"));

  subdistrictSelect.innerHTML = `<option value="">ทุกตำบล</option>`;
  subdistricts.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subdistrictSelect.appendChild(opt);
  });
}

function applyFilters() {
  if (!allCenters.length) return;

  const searchInput = document.getElementById("search-input");
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const subdistrictSelect = document.getElementById("filter-subdistrict");

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedProvince = provinceSelect.value;
  const selectedDistrict = districtSelect.value;
  const selectedSubdistrict = subdistrictSelect.value;

  let filtered = allCenters;

  if (selectedProvince) {
    filtered = filtered.filter((c) => c.Province === selectedProvince);
  }
  if (selectedDistrict) {
    filtered = filtered.filter((c) => c.District === selectedDistrict);
  }
  if (selectedSubdistrict) {
    filtered = filtered.filter((c) => c.Subdistrict === selectedSubdistrict);
  }

  if (searchTerm) {
    filtered = filtered.filter((c) => {
      const name = (c.ReliefCenterName || "").toLowerCase();
      const detail = (c.CenterDetails || "").toLowerCase();
      const coord = (c.CoordinatorName || "").toLowerCase();
      return (
        name.includes(searchTerm) ||
        detail.includes(searchTerm) ||
        coord.includes(searchTerm)
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

  totalEl.textContent = allCenters.length.toString();
  visibleEl.textContent = filtered.length.toString();
  listCountEl.textContent = `${filtered.length} แห่ง`;
}

function renderMarkers(filtered) {
  markersLayer.clearLayers();
  currentMarkers = [];
  selectedMarker = null;

  if (!filtered.length) return;

  // ถ้าอยากใช้ไอคอน SVG เอง ให้เตรียมไฟล์ icons/relief-kitchen.svg
  const icon = L.icon({
    iconUrl: "icons/relief-kitchen.svg", // หรือ .png ก็ได้
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -28],
  });

  const bounds = [];

  filtered.forEach((c) => {
    const lat = c.Latitude;
    const lng = c.Longitude;

    const popupHtml = `
      <div style="min-width: 220px">
        <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(
          c.ReliefCenterName || "-"
        )}</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">
          ${escapeHtml(c.Subdistrict || "-")}, ${escapeHtml(
      c.District || "-"
    )}, ${escapeHtml(c.Province || "-")}
        </div>
        ${
          c.CenterDetails
            ? `<div style="font-size:12px;margin-bottom:4px;">${escapeHtml(
                c.CenterDetails
              )}</div>`
            : ""
        }
        ${
          c.CoordinatorName || c.CoordinatorPhone
            ? `<div style="font-size:12px;margin-bottom:4px;">
                 ผู้ประสานงาน: ${escapeHtml(c.CoordinatorName || "-")}<br/>
                 เบอร์: ${escapeHtml(c.CoordinatorPhone || "-")}
               </div>`
            : ""
        }
        ${
          c.GoogleMap
            ? `<a href="${escapeAttr(
                c.GoogleMap
              )}" target="_blank" rel="noopener" style="font-size:12px;">
                 เปิดใน Google Maps
               </a>`
            : ""
        }
      </div>
    `;

    const marker = L.marker([lat, lng], { icon }).bindPopup(popupHtml);

    marker.addTo(markersLayer);

    currentMarkers.push({ marker, data: c });
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

  filtered.forEach((c) => {
    const card = document.createElement("div");
    card.className = "center-card";

    const detailText = c.CenterDetails || "";
    const truncatedDetail =
      detailText.length > 140
        ? detailText.slice(0, 140) + "..."
        : detailText;

    card.innerHTML = `
      <div class="center-name">${escapeHtml(
        c.ReliefCenterName || "ไม่ระบุชื่อศูนย์"
      )}</div>
      <div class="center-location">
        ${escapeHtml(c.Subdistrict || "-")}, ${escapeHtml(
      c.District || "-"
    )}, ${escapeHtml(c.Province || "-")}
      </div>
      ${
        detailText
          ? `<div class="center-detail">${escapeHtml(truncatedDetail)}</div>`
          : ""
      }
      <div class="center-meta">
        ${
          c.CoordinatorName
            ? `ผู้ประสานงาน: ${escapeHtml(c.CoordinatorName)}`
            : ""
        }
        ${
          c.CoordinatorPhone
            ? (c.CoordinatorName ? " | " : "") +
              `เบอร์: ${escapeHtml(c.CoordinatorPhone)}`
            : ""
        }
      </div>
    `;

    card.addEventListener("click", () => {
      focusOnCenter(c);
      highlightCard(card);
    });

    listEl.appendChild(card);
  });
}

function focusOnCenter(center) {
  const cm = currentMarkers.find((m) => m.data === center);
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
