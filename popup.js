"use strict";

const STORAGE_KEY = "lavAverageStyleConfigV1";
const PREDICTED_GRADES = [6, 5, 4, 3, 2, 1];

// Default config must match content-script defaults to keep current behavior.
const DEFAULT_CONFIG = {
  gradeThresholds: [
    { min: 5.75, style: { background: "#16a085", text: "#ffffff", border: "#12806a" } },
    { min: 4.75, style: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" } },
    { min: 3.75, style: { background: "#2ecc71", text: "#ffffff", border: "#27ae60" } },
    { min: 2.75, style: { background: "#f39c12", text: "#ffffff", border: "#d8870d" } },
    { min: 1.75, style: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" } },
    { min: 0, style: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" } },
  ],
  pointThresholds: [
    { min: 100.00, style: { background: "#16a085", text: "#ffffff", border: "#12806a" } },
    { min: 90.00, style: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" } },
    { min: 70.00, style: { background: "#2ecc71", text: "#ffffff", border: "#27ae60" } },
    { min: 50.00, style: { background: "#f39c12", text: "#ffffff", border: "#d8870d" } },
    { min: 40.00, style: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" } },
    { min: 0, style: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" } },
  ],
  predictedGradeThresholds: [
    { grade: 6, min: 5.75 },
    { grade: 5, min: 4.75 },
    { grade: 4, min: 3.75 },
    { grade: 3, min: 2.75 },
    { grade: 2, min: 1.75 },
    { grade: 1, min: 0.00 },
  ],
  predictedPointThresholds: [
    { grade: 6, min: 100.00 },
    { grade: 5, min: 90.00 },
    { grade: 4, min: 70.00 },
    { grade: 3, min: 50.00 },
    { grade: 2, min: 40.00 },
    { grade: 1, min: 0.00 },
  ],
  predictedGradeStyles: {
    1: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" },
    2: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" },
    3: { background: "#f39c12", text: "#ffffff", border: "#d8870d" },
    4: { background: "#2ecc71", text: "#ffffff", border: "#27ae60" },
    5: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" },
    6: { background: "#16a085", text: "#ffffff", border: "#12806a" },
  },
};

const ui = {
  gradeContainer: document.getElementById("grade-thresholds"),
  pointContainer: document.getElementById("point-thresholds"),
  predGradeContainer: document.getElementById("pred-grade-thresholds"),
  predPointContainer: document.getElementById("pred-point-thresholds"),
  predStyleContainer: document.getElementById("pred-grade-styles"),
  status: document.getElementById("status"),
  template: document.getElementById("threshold-template"),
  predThresholdTemplate: document.getElementById("pred-threshold-template"),
  predStyleTemplate: document.getElementById("pred-style-template"),
  addGradeBtn: document.getElementById("add-grade-threshold"),
  addPointBtn: document.getElementById("add-point-threshold"),
  saveBtn: document.getElementById("save-config"),
  resetBtn: document.getElementById("reset-defaults"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".tab-panel")),
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

function normalizeGradeValue(value, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) return fallback;
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
  const predictedGradeThresholds = normalizePredictionThresholds(rawConfig?.predictedGradeThresholds, DEFAULT_CONFIG.predictedGradeThresholds);
  const predictedPointThresholds = normalizePredictionThresholds(rawConfig?.predictedPointThresholds, DEFAULT_CONFIG.predictedPointThresholds);
  const predictedGradeStyles = normalizePredictedGradeStyles(rawConfig?.predictedGradeStyles, DEFAULT_CONFIG.predictedGradeStyles);

  return {
    gradeThresholds,
    pointThresholds,
    predictedGradeThresholds,
    predictedPointThresholds,
    predictedGradeStyles,
  };
}

function normalizePredictionThresholds(rawList, fallbackList) {
  const fallbackByGrade = new Map(fallbackList.map((entry) => [entry.grade, entry]));
  const source = Array.isArray(rawList) ? rawList : [];
  const sourceByGrade = new Map();

  for (const entry of source) {
    const grade = normalizeGradeValue(entry?.grade, null);
    if (grade === null) continue;
    sourceByGrade.set(grade, entry);
  }

  return PREDICTED_GRADES
    .map((grade) => {
      const fallback = fallbackByGrade.get(grade) || { grade, min: 0 };
      const entry = sourceByGrade.get(grade);
      return {
        grade,
        min: normalizeThresholdValue(entry?.min, fallback.min),
      };
    })
    .sort((a, b) => b.grade - a.grade);
}

function normalizePredictedGradeStyles(rawStyles, fallbackStyles) {
  const normalized = {};

  for (const grade of PREDICTED_GRADES) {
    const key = String(grade);
    const fallback = fallbackStyles[key] || fallbackStyles[grade];
    normalized[key] = {
      background: normalizeHexColor(rawStyles?.[key]?.background, fallback.background),
      text: normalizeHexColor(rawStyles?.[key]?.text, fallback.text),
      border: normalizeHexColor(rawStyles?.[key]?.border, fallback.border),
    };
  }

  return normalized;
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

function buildPredictionThresholdRow(entry, mode) {
  const row = ui.predThresholdTemplate.content.firstElementChild.cloneNode(true);

  const gradeInput = row.querySelector(".input-grade");
  const minInput = row.querySelector(".input-min");
  const suffix = row.querySelector(".suffix");

  row.dataset.grade = String(entry.grade);
  gradeInput.value = String(entry.grade);
  minInput.value = String(entry.min);
  minInput.min = "0";
  minInput.step = "0.01";
  suffix.textContent = mode === "point" ? "%" : "";

  minInput.addEventListener("input", clearStatus);

  return row;
}

function buildPredictionStyleRow(grade, style) {
  const row = ui.predStyleTemplate.content.firstElementChild.cloneNode(true);

  const gradeInput = row.querySelector(".input-grade");
  const bgInput = row.querySelector(".input-bg");
  const textInput = row.querySelector(".input-text");
  const borderInput = row.querySelector(".input-border");
  const preview = row.querySelector(".preview-badge");

  row.dataset.grade = String(grade);
  gradeInput.value = String(grade);

  bgInput.value = style.background;
  textInput.value = style.text;
  borderInput.value = style.border;

  function updatePreview() {
    preview.style.backgroundColor = bgInput.value;
    preview.style.color = textInput.value;
    preview.style.borderColor = borderInput.value;
    preview.textContent = String(grade);
  }

  bgInput.addEventListener("input", updatePreview);
  textInput.addEventListener("input", updatePreview);
  borderInput.addEventListener("input", updatePreview);

  updatePreview();
  return row;
}

function renderThresholdSection(container, list, mode) {
  container.innerHTML = "";
  for (const entry of list) {
    container.appendChild(buildThresholdRow(entry, mode));
  }
}

function renderPredictionThresholdSection(container, list, mode) {
  container.innerHTML = "";
  for (const entry of list) {
    container.appendChild(buildPredictionThresholdRow(entry, mode));
  }
}

function renderPredictedStylesSection(container, styles) {
  container.innerHTML = "";
  for (const grade of PREDICTED_GRADES) {
    const style = styles[String(grade)] || DEFAULT_CONFIG.predictedGradeStyles[String(grade)];
    container.appendChild(buildPredictionStyleRow(grade, style));
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

function readPredictionSection(container) {
  const rows = Array.from(container.querySelectorAll(".pred-threshold-row"));

  return rows
    .map((row) => {
      const grade = parseInt(row.dataset.grade || "", 10);
      return {
        grade,
        min: parseFloat(row.querySelector(".input-min").value),
      };
    })
    .filter((entry) => Number.isInteger(entry.grade) && entry.grade >= 1 && entry.grade <= 6 && Number.isFinite(entry.min))
    .sort((a, b) => b.grade - a.grade);
}

function readPredictedStylesSection(container) {
  const rows = Array.from(container.querySelectorAll(".pred-style-row"));
  const styles = {};

  for (const row of rows) {
    const grade = parseInt(row.dataset.grade || "", 10);
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) continue;

    styles[String(grade)] = {
      background: row.querySelector(".input-bg").value,
      text: row.querySelector(".input-text").value,
      border: row.querySelector(".input-border").value,
    };
  }

  return styles;
}

function populateForm(config) {
  renderThresholdSection(ui.gradeContainer, config.gradeThresholds, "grade");
  renderThresholdSection(ui.pointContainer, config.pointThresholds, "point");
  renderPredictionThresholdSection(ui.predGradeContainer, config.predictedGradeThresholds, "grade");
  renderPredictionThresholdSection(ui.predPointContainer, config.predictedPointThresholds, "point");
  renderPredictedStylesSection(ui.predStyleContainer, config.predictedGradeStyles);
}

async function loadConfigFromStorage() {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeConfig(stored?.[STORAGE_KEY]);
}

async function saveConfigToStorage(config) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

async function notifyActiveTabConfigSaved(config) {
  if (!chrome?.tabs?.query || !chrome?.tabs?.sendMessage) return;

  await new Promise((resolve) => {
    const finish = () => resolve();

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime?.lastError) {
          finish();
          return;
        }

        const activeTabId = tabs?.[0]?.id;
        if (!Number.isInteger(activeTabId)) {
          finish();
          return;
        }

        chrome.tabs.sendMessage(activeTabId, {
          type: "lav-style-config-updated",
          config,
        }, () => {
          // Ignore when messaging fails or the active tab has no content script.
          if (chrome.runtime?.lastError) {
            finish();
            return;
          }

          finish();
        });
      });
    } catch {
      finish();
    }
  });
}

function addThreshold(container, mode) {
  const defaults = mode === "point" ? DEFAULT_CONFIG.pointThresholds : DEFAULT_CONFIG.gradeThresholds;
  const fallback = defaults[defaults.length - 1];
  container.appendChild(buildThresholdRow(fallback, mode));
  clearStatus();
}

function switchTab(tabName) {
  for (const tab of ui.tabs) {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  for (const panel of ui.panels) {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }
}

function hasAllPredictedGrades(list) {
  if (list.length !== 6) return false;
  const unique = new Set(list.map((entry) => entry.grade));
  return unique.size === 6;
}

function hasMonotonicPredictedThresholds(list) {
  const byGradeDesc = [...list].sort((a, b) => b.grade - a.grade);

  for (let i = 1; i < byGradeDesc.length; i += 1) {
    const higherGrade = byGradeDesc[i - 1];
    const lowerGrade = byGradeDesc[i];

    // Higher grade cannot require a lower minimum than a lower grade.
    if (higherGrade.min < lowerGrade.min) {
      return false;
    }
  }

  return true;
}

function collectAndValidateConfig() {
  const gradeThresholds = readThresholdSection(ui.gradeContainer);
  const pointThresholds = readThresholdSection(ui.pointContainer);
  const predictedGradeThresholds = readPredictionSection(ui.predGradeContainer);
  const predictedPointThresholds = readPredictionSection(ui.predPointContainer);
  const predictedGradeStyles = readPredictedStylesSection(ui.predStyleContainer);

  if (gradeThresholds.length === 0) {
    throw new Error("Dodaj co najmniej jeden próg dla średnich ocen.");
  }

  if (pointThresholds.length === 0) {
    throw new Error("Dodaj co najmniej jeden próg dla średnich procentowych.");
  }

  if (!hasAllPredictedGrades(predictedGradeThresholds)) {
    throw new Error("Progi przewidywanej oceny (średnia) muszą zawierać oceny 1-6.");
  }

  if (!hasAllPredictedGrades(predictedPointThresholds)) {
    throw new Error("Progi przewidywanej oceny (punkty) muszą zawierać oceny 1-6.");
  }

  if (!hasMonotonicPredictedThresholds(predictedGradeThresholds)) {
    throw new Error("Progi przewidywanej oceny (średnia) muszą maleć lub pozostać równe od oceny 6 do 1.");
  }

  if (!hasMonotonicPredictedThresholds(predictedPointThresholds)) {
    throw new Error("Progi przewidywanej oceny (punkty) muszą maleć lub pozostać równe od oceny 6 do 1.");
  }

  return normalizeConfig({
    gradeThresholds,
    pointThresholds,
    predictedGradeThresholds,
    predictedPointThresholds,
    predictedGradeStyles,
  });
}

function attachEvents() {
  for (const tab of ui.tabs) {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
      clearStatus();
    });
  }

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
      await notifyActiveTabConfigSaved(config);
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
