// 👉 URL Web App ของ "โรงครัวกลาง" (ของเดิมที่ใช้ใน app.js)
const KITCHEN_API_URL =
  "https://script.google.com/macros/s/AKfycbze94fwwzH5JxO11yqX1qFK4utLaB9Oaxqw7oy_0C4PrtjHlDxf_iVkq0YOYbfRvvrr/exec";

// 👉 URL Web App ของ "ศูนย์พักพิง" (ตัวที่คุณส่งมาข้างบน)
const SHELTERS_API_URL =
  "https://script.google.com/macros/s/AKfycby07YqY45xDPgbekG69Z1ZuOhqjGVGMdSSmgOgZgwXASzDnGcug63CIMdwLNLQKHCECbw/exec";

let map;
let markersLayer;
let allPoints = [];      // จุดทุกประเภท (โรงครัว + ศูนย์พักพิง)
let currentMarkers = [];
let selectedMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initEvents();
  loadAllData();
});

function initMap() {
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
  const subdistrictSelect = document.getElementById("filter-subdistrict");
  const typeSelect = document.getElementById("filter-type");
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
  typeSelect.addEventListener("change", applyFilters);

  btnReset.addEventListener("click", () => {
    searchInput.value = "";
    provinceSelect.value = "";
    districtSelect.innerHTML = `<option value="">ทุกอำเภอ</option>`;
    subdistrictSelect.innerHTML = `<option value="">ทุกตำบล</option>`;
    typeSelect.value = "";
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

async function loadAllData() {
  const statusText = document.getElementById("status-text");

  try {
    statusText.textContent = "กำลังโหลดข้อมูลจาก Google Sheets (2 แหล่ง)...";
    statusText.className = "badge-value badge-loading";

    const [kitchenRes, shelterRes] = await Promise.all([
      fetch(KITCHEN_API_URL),
      fetch(SHELTERS_API_URL),
    ]);

    const kitchenText = await kitchenRes.text();
    const shelterText = await shelterRes.text();

    console.log("Kitchen raw:", kitchenText);
    console.log("Shelter raw:", shelterText);

    if (!kitchenRes.ok) {
      throw new Error(
        "โหลดโรงครัวกลางไม่สำเร็จ: " +
          kitchenRes.status +
          " " +
          kitchenRes.statusText
      );
    }
    if (!shelterRes.ok) {
      throw new Error(
        "โหลดศูนย์พักพิงไม่สำเร็จ: " +
          shelterRes.status +
          " " +
          shelterRes.statusText
      );
    }

    let kitchenJson, shelterJson;
    try {
      kitchenJson = JSON.parse(kitchenText);
      shelterJson = JSON.parse(shelterText);
    } catch (e) {
      console.error("แปลง JSON ไม่ได้:", e);
      throw new Error("ข้อมูลที่ได้ไม่ใช่ JSON ที่ถูกต้อง");
    }

    // แปลงเป็น array
    const kitchenArr = extractArrayFromJson(kitchenJson);
    const shelterArr = extractArrayFromJson(shelterJson);

    const kitchens = mapKitchenData(kitchenArr);
    const shelters = mapShelterData(shelterArr);

    allPoints = [...kitchens, ...shelters];

    console.log("จุดทั้งหมด:", allPoints.length);

    populateFilterOptions();
    applyFilters();

    statusText.textContent = "โหลดข้อมูลสำเร็จ";
    statusText.className = "badge-value badge-success";
  } catch (err) {
    console.error("เกิดข้อผิดพลาดใน loadAllData():", err);
    statusText.textContent = "โหลดข้อมูลไม่สำเร็จ";
    statusText.className = "badge-value badge-error";
    alert(
      "ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้\n" +
        String(err)
    );
  }
}

function extractArrayFromJson(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.records)) return json.records;
  console.warn("โครงสร้าง JSON ไม่คุ้น:", json);
  return [];
}

/**
 * แปลงข้อมูลโรงครัวกลางให้เป็นโครง uniform
 * คาดว่าหัวตาราง:
 * Province, District, Subdistrict, ReliefCenterName, CenterDetails,
 * Latitude, Longitude, CoordinatorName, CoordinatorPhone, GoogleMap, Source, Notes
 */
function mapKitchenData(arr) {
  return arr
    .map((row) => {
      const lat = parseFloat(row.Latitude);
      const lng = parseFloat(row.Longitude);

      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;

      return {
        kind: "kitchen",
        province: row.Province || "",
        district: row.District || "",
        subdistrict: row.Subdistrict || "",
        name: row.ReliefCenterName || "โรงครัวกลาง",
        details: row.CenterDetails || "",
        status: "", // ไม่มี status ชัดเจนในโรงครัว
        contacts: [
          {
            name: row.CoordinatorName || "",
            phone: row.CoordinatorPhone || "",
          },
        ],
        googleMap: row.GoogleMap || "",
        ref: row.Source || "",
        lat,
        lng,
      };
    })
    .filter(Boolean);
}

/**
 * แปลงข้อมูลศูนย์พักพิงให้เป็นโครง uniform
 * ตามหัวตารางที่คุณให้:
 * จังหวัด, อำเภอ, id, name, location, status, area, link, contact_1_name, ...
 * Latitude, Longitude, google map, ref
 */
function mapShelterData(arr) {
  return arr
    .map((row) => {
      const province =
        row.Province || row.province || row["จังหวัด"] || "";
      const district =
        row.District || row.district || row["อำเภอ"] || "";
      const subdistrict =
        row.Subdistrict || row.subdistrict || row["ตำบล"] || "";

      const name = row.name || row["name"] || "ศูนย์พักพิง";
      const location = row.location || row["location"] || "";
      const status = row.status || row["status"] || "";

      const lat = parseFloat(row.Latitude || row.latitude);
      const lng = parseFloat(row.Longitude || row.longitude);

      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;

      const contacts = [];

      if (row.contact_1_name || row.contact_1_phone) {
        contacts.push({
          name: row.contact_1_name || "",
          phone: row.contact_1_phone || "",
        });
      }
      if (row.contact_2_name || row.contact_2_phone) {
        contacts.push({
          name: row.contact_2_name || "",
          phone: row.contact_2_phone || "",
        });
      }
      if (row.contact_3_name || row.contact_3_phone) {
        contacts.push({
          name: row.contact_3_name || "",
          phone: row.contact_3_phone || "",
        });
      }
      if (row.contact_4_name || row.contact_4_phone) {
        contacts.push({
          name: row.contact_4_name || "",
          phone: row.contact_4_phone || "",
        });
      }

      const googleMap =
        row["google map"] || row.google_map || row.GoogleMap || "";
      const ref = row.ref || row["ref"] || "";

      return {
        kind: "shelter",
        province,
        district,
        subdistrict,
        name,
        details: location,
        status,
        contacts,
        googleMap,
        ref,
        lat,
        lng,
      };
    })
    .filter(Boolean);
}

function populateFilterOptions() {
  const provinceSelect = document.getElementById("filter-province");

  const provinces = [...new Set(allPoints.map((p) => p.province || ""))]
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

  let filtered = allPoints;
  if (selectedProvince) {
    filtered = filtered.filter((p) => p.province === selectedProvince);
  }

  const districts = [...new Set(filtered.map((p) => p.district || ""))]
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

  let filtered = allPoints;
  if (selectedProvince) {
    filtered = filtered.filter((p) => p.province === selectedProvince);
  }
  if (selectedDistrict) {
    filtered = filtered.filter((p) => p.district === selectedDistrict);
  }

  const subdistricts = [
    ...new Set(filtered.map((p) => p.subdistrict || "")),
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
  if (!allPoints.length) return;

  const searchInput = document.getElementById("search-input");
  const provinceSelect = document.getElementById("filter-province");
  const districtSelect = document.getElementById("filter-district");
  const subdistrictSelect = document.getElementById("filter-subdistrict");
  const typeSelect = document.getElementById("filter-type");

  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedProvince = provinceSelect.value;
  const selectedDistrict = districtSelect.value;
  const selectedSubdistrict = subdistrictSelect.value;
  const selectedType = typeSelect.value;

  let filtered = allPoints;

  if (selectedProvince) {
    filtered = filtered.filter((p) => p.province === selectedProvince);
  }
  if (selectedDistrict) {
    filtered = filtered.filter((p) => p.district === selectedDistrict);
  }
  if (selectedSubdistrict) {
    filtered = filtered.filter((p) => p.subdistrict === selectedSubdistrict);
  }
  if (selectedType) {
    filtered = filtered.filter((p) => p.kind === selectedType);
  }

  if (searchTerm) {
    filtered = filtered.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const details = (p.details || "").toLowerCase();
      const status = (p.status || "").toLowerCase();
      const contacts = (p.contacts || [])
        .map((c) => (c.name + " " + c.phone).toLowerCase())
        .join(" ");
      return (
        name.includes(searchTerm) ||
        details.includes(searchTerm) ||
        status.includes(searchTerm) ||
        contacts.includes(searchTerm)
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

  totalEl.textContent = allPoints.length.toString();
  visibleEl.textContent = filtered.length.toString();
  listCountEl.textContent = `${filtered.length} แห่ง`;
}

function renderMarkers(filtered) {
  markersLayer.clearLayers();
  currentMarkers = [];
  selectedMarker = null;

  if (!filtered.length) return;

  const kitchenIcon = L.icon({
    iconUrl: "icons/relief-kitchen.svg",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -28],
  });

  const shelterIcon = L.icon({
    iconUrl: "icons/shelter.svg",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -28],
  });

  const bounds = [];

  filtered.forEach((p) => {
    const { lat, lng } = p;

    const contactsHtml = (p.contacts || [])
      .map((c, idx) => {
        const label = idx === 0 ? "ผู้ประสานงาน" : `ผู้ประสานงาน ${idx + 1}`;
        return `• ${escapeHtml(c.name || label)}: ${escapeHtml(
          c.phone || "-"
        )}`;
      })
      .join("<br/>");

    const typeLabel =
      p.kind === "kitchen" ? "โรงครัวกลาง" : "ศูนย์พักพิง (Shelter)";

    const popupHtml = `
      <div style="min-width: 230px">
        <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(
          p.name || "-"
        )}</div>
        <div style="font-size:12px;color:#e5e7eb;margin-bottom:4px;">
          ประเภท: <strong>${escapeHtml(typeLabel)}</strong>
        </div>
        <div style="font-size:12px;color:#e5e7eb;margin-bottom:4px;">
          ${escapeHtml(p.subdistrict || "-")}, ${escapeHtml(
      p.district || "-"
    )}, ${escapeHtml(p.province || "-")}
        </div>
        ${
          p.details
            ? `<div style="font-size:12px;margin-bottom:4px;">
                 ${escapeHtml(p.details)}
               </div>`
            : ""
        }
        ${
          p.status
            ? `<div style="font-size:12px;margin-bottom:4px;">
                 สถานะ: <strong>${escapeHtml(p.status)}</strong>
               </div>`
            : ""
        }
        ${
          contactsHtml
            ? `<div style="font-size:12px;margin-bottom:4px;">
                 <div style="font-weight:600;margin-bottom:2px;">ผู้ประสานงาน:</div>
                 ${contactsHtml}
               </div>`
            : ""
        }
        ${
          p.googleMap
            ? `<a href="${escapeAttr(
                p.googleMap
              )}" target="_blank" rel="noopener" style="font-size:12px;">
                 เปิดใน Google Maps
               </a><br/>`
            : ""
        }
        ${
          p.ref
            ? `<span style="font-size:11px;color:#9ca3af;">
                 แหล่งที่มา: ${escapeHtml(p.ref)}
               </span>`
            : ""
        }
      </div>
    `;

    const icon = p.kind === "kitchen" ? kitchenIcon : shelterIcon;

    const marker = L.marker([lat, lng], { icon }).bindPopup(popupHtml);

    marker.addTo(markersLayer);

    currentMarkers.push({ marker, data: p });
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

  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "center-card";

    const typeLabel =
      p.kind === "kitchen" ? "โรงครัวกลาง" : "ศูนย์พักพิง";

    const mainContact =
      (p.contacts && p.contacts.length && p.contacts[0]) || null;

    card.innerHTML = `
      <div class="center-name">${escapeHtml(p.name || "ไม่ระบุชื่อ")}</div>
      <div class="center-location">
        ${escapeHtml(p.subdistrict || "-")}, ${escapeHtml(
      p.district || "-"
    )}, ${escapeHtml(p.province || "-")}
      </div>
      ${
        p.details
          ? `<div class="center-detail">${escapeHtml(p.details)}</div>`
          : ""
      }
      <div class="center-meta">
        ประเภท: ${escapeHtml(typeLabel)}
        ${
          mainContact
            ? `<br/>ผู้ประสานงานหลัก: ${escapeHtml(
                mainContact.name || "-"
              )} (${escapeHtml(mainContact.phone || "-")})`
            : ""
        }
      </div>
    `;

    card.addEventListener("click", () => {
      focusOnPoint(p);
      highlightCard(card);
    });

    listEl.appendChild(card);
  });
}

function focusOnPoint(point) {
  const cm = currentMarkers.find((m) => m.data === point);
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
