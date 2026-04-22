"use strict";

const STORAGE_KEY = "lavAverageStyleConfigV1";

// Default config must match content-script defaults to keep current behavior.
const DEFAULT_CONFIG = {
  gradeThresholds: [
    { min: 4.75, style: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" } },
    { min: 3.75, style: { background: "#2ecc71", text: "#1a5c30", border: "#27ae60" } },
    { min: 2.75, style: { background: "#f39c12", text: "#ffffff", border: "#d8870d" } },
    { min: 1.75, style: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" } },
    { min: 0, style: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" } },
  ],
  pointThresholds: [
    { min: 90.00, style: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" } },
    { min: 70.00, style: { background: "#2ecc71", text: "#1a5c30", border: "#27ae60" } },
    { min: 50.00, style: { background: "#f39c12", text: "#ffffff", border: "#d8870d" } },
    { min: 40.00, style: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" } },
    { min: 0, style: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" } },
  ],
};

const ui = {
  gradeContainer: document.getElementById("grade-thresholds"),
  pointContainer: document.getElementById("point-thresholds"),
  status: document.getElementById("status"),
  template: document.getElementById("threshold-template"),
  addGradeBtn: document.getElementById("add-grade-threshold"),
  addPointBtn: document.getElementById("add-point-threshold"),
  saveBtn: document.getElementById("save-config"),
  resetBtn: document.getElementById("reset-defaults"),
};

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function normalizeHexColor(color, fallback) {
  const value = String(color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return fallback;
}

function normalizeThresholdValue(value, fallback) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeThresholds(rawList, fallbackList) {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return cloneConfig(fallbackList);
  }

  return rawList
    .map((entry, index) => {
      const fallback = fallbackList[Math.min(index, fallbackList.length - 1)];
      return {
        min: normalizeThresholdValue(entry?.min, fallback.min),
        style: {
          background: normalizeHexColor(entry?.style?.background, fallback.style.background),
          text: normalizeHexColor(entry?.style?.text, fallback.style.text),
          border: normalizeHexColor(entry?.style?.border, fallback.style.border),
        },
      };
    })
    .sort((a, b) => b.min - a.min);
}

function normalizeConfig(rawConfig) {
  const gradeThresholds = normalizeThresholds(rawConfig?.gradeThresholds, DEFAULT_CONFIG.gradeThresholds);
  const pointThresholds = normalizeThresholds(rawConfig?.pointThresholds, DEFAULT_CONFIG.pointThresholds);

  return {
    gradeThresholds,
    pointThresholds,
  };
}

function setStatus(message, type = "success") {
  ui.status.textContent = message;
  ui.status.className = `status ${type}`;
}

function clearStatus() {
  ui.status.textContent = "";
  ui.status.className = "status";
}

function buildThresholdRow(entry, mode) {
  const row = ui.template.content.firstElementChild.cloneNode(true);

  const minInput = row.querySelector(".input-min");
  const bgInput = row.querySelector(".input-bg");
  const textInput = row.querySelector(".input-text");
  const borderInput = row.querySelector(".input-border");
  const suffix = row.querySelector(".suffix");
  const preview = row.querySelector(".preview-badge");
  const removeBtn = row.querySelector(".remove-threshold");

  suffix.textContent = mode === "point" ? "%" : "";
  minInput.value = String(entry.min);
  minInput.min = "0";
  minInput.step = "0.01";

  bgInput.value = entry.style.background;
  textInput.value = entry.style.text;
  borderInput.value = entry.style.border;

  // Keep preview synchronized with the selected colors.
  function updatePreview() {
    preview.style.backgroundColor = bgInput.value;
    preview.style.color = textInput.value;
    preview.style.borderColor = borderInput.value;
    preview.textContent = mode === "point" ? `${Number(minInput.value || 0).toFixed(1)}%` : Number(minInput.value || 0).toFixed(2);
  }

  minInput.addEventListener("input", updatePreview);
  bgInput.addEventListener("input", updatePreview);
  textInput.addEventListener("input", updatePreview);
  borderInput.addEventListener("input", updatePreview);

  removeBtn.addEventListener("click", () => {
    row.remove();
    clearStatus();
  });

  updatePreview();
  return row;
}

function renderThresholdSection(container, list, mode) {
  container.innerHTML = "";
  for (const entry of list) {
    container.appendChild(buildThresholdRow(entry, mode));
  }
}

function readThresholdSection(container) {
  const rows = Array.from(container.querySelectorAll(".threshold-row"));
  return rows
    .map((row) => ({
      min: parseFloat(row.querySelector(".input-min").value),
      style: {
        background: row.querySelector(".input-bg").value,
        text: row.querySelector(".input-text").value,
        border: row.querySelector(".input-border").value,
      },
    }))
    .filter((entry) => Number.isFinite(entry.min))
    .sort((a, b) => b.min - a.min);
}

function populateForm(config) {
  renderThresholdSection(ui.gradeContainer, config.gradeThresholds, "grade");
  renderThresholdSection(ui.pointContainer, config.pointThresholds, "point");
}

async function loadConfigFromStorage() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeConfig(stored?.[STORAGE_KEY]);
}

async function saveConfigToStorage(config) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

function addThreshold(container, mode) {
  const defaults = mode === "point" ? DEFAULT_CONFIG.pointThresholds : DEFAULT_CONFIG.gradeThresholds;
  const fallback = defaults[defaults.length - 1];
  container.appendChild(buildThresholdRow(fallback, mode));
  clearStatus();
}

function collectAndValidateConfig() {
  const gradeThresholds = readThresholdSection(ui.gradeContainer);
  const pointThresholds = readThresholdSection(ui.pointContainer);

  if (gradeThresholds.length === 0) {
    throw new Error("Dodaj co najmniej jeden próg dla średnich ocen.");
  }

  if (pointThresholds.length === 0) {
    throw new Error("Dodaj co najmniej jeden próg dla średnich procentowych.");
  }

  return normalizeConfig({
    gradeThresholds,
    pointThresholds,
  });
}

function attachEvents() {
  ui.addGradeBtn.addEventListener("click", () => addThreshold(ui.gradeContainer, "grade"));
  ui.addPointBtn.addEventListener("click", () => addThreshold(ui.pointContainer, "point"));

  ui.resetBtn.addEventListener("click", () => {
    populateForm(cloneConfig(DEFAULT_CONFIG));
    clearStatus();
    setStatus("Przywrócono domyślne style.");
  });

  ui.saveBtn.addEventListener("click", async () => {
    try {
      const config = collectAndValidateConfig();
      await saveConfigToStorage(config);
      setStatus("Ustawienia zapisane.");
    } catch (error) {
      setStatus(error.message || "Nie udało się zapisać ustawień.", "error");
    }
  });
}

async function init() {
  attachEvents();

  try {
    const config = await loadConfigFromStorage();
    populateForm(config);
  } catch {
    populateForm(cloneConfig(DEFAULT_CONFIG));
    setStatus("Nie udało się wczytać ustawień. Pokazano domyślne.", "error");
  }
}

init();
