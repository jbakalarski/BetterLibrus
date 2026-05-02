/**
 * Better Librus - Content Script
 * Calculates and displays grade averages even when disabled by school admins.
 *
 * Librus grades that count toward the average are marked with aktywne.png (active).
 * Grades NOT counted are marked with nieaktywne.png (inactive).
 * Special grades like "np", "nb", "nk", "bz" are ignored in average calculation.
 *
 * Grade modifiers are configurable from the extension popup.
 */

(function () {
  "use strict";

  // ─── Constants ─────────────────────────────────────────────────────────────

  const EXTENSION_NAME = "Better Librus";
  const CALCULATED_BY_LABEL = `obliczone przez ${EXTENSION_NAME}`;
  const STYLE_CONFIG_STORAGE_KEY = "lavAverageStyleConfigV1";
  const PREDICTED_GRADES = [6, 5, 4, 3, 2, 1];

  const SPECIAL_GRADES = new Set(["np", "nb", "nk", "bz", "uł", "nł", "zl", "nz", "zw", "uc", "nu"]);

  // Default style config preserves current behavior.
  const DEFAULT_STYLE_CONFIG = Object.freeze({
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
    predictedGrades: [
      { grade: 6, averageMin: 5.75, pointMin: 100.00, style: { background: "#16a085", text: "#ffffff", border: "#12806a" } },
      { grade: 5, averageMin: 4.75, pointMin: 90.00, style: { background: "#27ae60", text: "#ffffff", border: "#1f8b4c" } },
      { grade: 4, averageMin: 3.75, pointMin: 70.00, style: { background: "#2ecc71", text: "#ffffff", border: "#27ae60" } },
      { grade: 3, averageMin: 2.75, pointMin: 50.00, style: { background: "#f39c12", text: "#ffffff", border: "#d8870d" } },
      { grade: 2, averageMin: 1.75, pointMin: 40.00, style: { background: "#e67e22", text: "#ffffff", border: "#c96d1d" } },
      { grade: 1, averageMin: 0.00, pointMin: 0.00, style: { background: "#e74c3c", text: "#ffffff", border: "#c53f32" } },
    ],
    gradeModifiers: {
      plus: 0.5,
      minus: -0.25,
    },
  });

  let styleConfig = cloneStyleConfig(DEFAULT_STYLE_CONFIG);
  let styleConfigSignature = JSON.stringify(styleConfig);

  function cloneStyleConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }

  function normalizeHexColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    return fallback;
  }

  function normalizeThresholdValue(value, fallback) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function normalizeModifierValue(value, fallback) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function normalizeGradeValue(value, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) return fallback;
    return parsed;
  }

  function normalizeThresholdList(rawList, defaultList) {
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return cloneStyleConfig(defaultList);
    }

    const normalized = rawList
      .map((entry, index) => {
        const fallback = defaultList[Math.min(index, defaultList.length - 1)];
        const style = entry?.style || {};
        return {
          min: normalizeThresholdValue(entry?.min, fallback.min),
          style: {
            background: normalizeHexColor(style.background, fallback.style.background),
            text: normalizeHexColor(style.text, fallback.style.text),
            border: normalizeHexColor(style.border, fallback.style.border),
          },
        };
      })
      .sort((a, b) => b.min - a.min);

    return normalized;
  }

  function normalizeStyleConfig(rawConfig) {
    const defaults = DEFAULT_STYLE_CONFIG;
    const gradeThresholds = normalizeThresholdList(rawConfig?.gradeThresholds, defaults.gradeThresholds);
    const pointThresholds = normalizeThresholdList(rawConfig?.pointThresholds, defaults.pointThresholds);
    const legacyPredictedGradeThresholds = normalizePredictedThresholdList(rawConfig?.predictedGradeThresholds, defaults.predictedGradeThresholds);
    const legacyPredictedPointThresholds = normalizePredictedThresholdList(rawConfig?.predictedPointThresholds, defaults.predictedPointThresholds);
    const legacyPredictedGradeStyles = normalizePredictedGradeStyles(rawConfig?.predictedGradeStyles, defaults.predictedGradeStyles);
    const predictedGrades = normalizePredictedGradeEntries(rawConfig?.predictedGrades, legacyPredictedGradeThresholds, legacyPredictedPointThresholds, legacyPredictedGradeStyles);
    const predictedGradeThresholds = predictedGrades.map((entry) => ({ grade: entry.grade, min: entry.averageMin }));
    const predictedPointThresholds = predictedGrades.map((entry) => ({ grade: entry.grade, min: entry.pointMin }));
    const predictedGradeStyles = predictedGrades.reduce((acc, entry) => {
      acc[String(entry.grade)] = { ...entry.style };
      return acc;
    }, {});
    const gradeModifiers = normalizeGradeModifiers(rawConfig?.gradeModifiers, defaults.gradeModifiers);

    return {
      gradeThresholds,
      pointThresholds,
      predictedGradeThresholds,
      predictedPointThresholds,
      predictedGradeStyles,
      predictedGrades,
      gradeModifiers,
    };
  }

  function normalizePredictedGradeEntries(rawEntries, legacyGradeThresholds, legacyPointThresholds, legacyStyles) {
    const source = Array.isArray(rawEntries) ? rawEntries : [];
    const sourceByGrade = new Map();

    for (const entry of source) {
      const grade = normalizeGradeValue(entry?.grade, null);
      if (grade === null) continue;
      sourceByGrade.set(grade, entry);
    }

    const legacyGradeByGrade = new Map(legacyGradeThresholds.map((entry) => [entry.grade, entry.min]));
    const legacyPointByGrade = new Map(legacyPointThresholds.map((entry) => [entry.grade, entry.min]));
    const defaultsByGrade = new Map(DEFAULT_STYLE_CONFIG.predictedGrades.map((entry) => [entry.grade, entry]));

    return PREDICTED_GRADES
      .map((grade) => {
        const current = sourceByGrade.get(grade);
        const fallback = defaultsByGrade.get(grade);
        const key = String(grade);
        const styleFallback = legacyStyles[key] || fallback.style;

        return {
          grade,
          averageMin: normalizeThresholdValue(current?.averageMin, normalizeThresholdValue(current?.avgMin, legacyGradeByGrade.get(grade) ?? fallback.averageMin)),
          pointMin: normalizeThresholdValue(current?.pointMin, legacyPointByGrade.get(grade) ?? fallback.pointMin),
          style: {
            background: normalizeHexColor(current?.style?.background, styleFallback.background),
            text: normalizeHexColor(current?.style?.text, styleFallback.text),
            border: normalizeHexColor(current?.style?.border, styleFallback.border),
          },
        };
      })
      .sort((a, b) => b.grade - a.grade);
  }

  function normalizeGradeModifiers(rawModifiers, defaults) {
    return {
      plus: normalizeModifierValue(rawModifiers?.plus, defaults.plus),
      minus: normalizeModifierValue(rawModifiers?.minus, defaults.minus),
    };
  }

  function normalizePredictedThresholdList(rawList, defaultList) {
    const fallbackByGrade = new Map(defaultList.map((entry) => [entry.grade, entry]));
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
        const current = sourceByGrade.get(grade);
        return {
          grade,
          min: normalizeThresholdValue(current?.min, fallback.min),
        };
      })
      .sort((a, b) => b.grade - a.grade);
  }

  function normalizePredictedGradeStyles(rawStyles, defaultStyles) {
    const normalized = {};
    for (const grade of PREDICTED_GRADES) {
      const key = String(grade);
      const fallback = defaultStyles[key] || defaultStyles[grade];
      normalized[key] = {
        background: normalizeHexColor(rawStyles?.[key]?.background, fallback.background),
        text: normalizeHexColor(rawStyles?.[key]?.text, fallback.text),
        border: normalizeHexColor(rawStyles?.[key]?.border, fallback.border),
      };
    }
    return normalized;
  }

  function applyStyleConfig(nextConfig) {
    const normalized = normalizeStyleConfig(nextConfig);
    const nextSignature = JSON.stringify(normalized);
    const hasChanged = nextSignature !== styleConfigSignature;

    styleConfig = normalized;
    styleConfigSignature = nextSignature;
    return hasChanged;
  }

  function isExtensionContextInvalidatedError(error) {
    return String(error?.message || error || "").includes("Extension context invalidated");
  }

  function loadStyleConfig() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync) {
        resolve(cloneStyleConfig(DEFAULT_STYLE_CONFIG));
        return;
      }

      try {
        chrome.storage.sync.get(STYLE_CONFIG_STORAGE_KEY, (result) => {
          try {
            if (chrome.runtime?.lastError) {
              resolve(cloneStyleConfig(DEFAULT_STYLE_CONFIG));
              return;
            }

            resolve(normalizeStyleConfig(result?.[STYLE_CONFIG_STORAGE_KEY]));
          } catch (error) {
            if (isExtensionContextInvalidatedError(error)) {
              resolve(cloneStyleConfig(DEFAULT_STYLE_CONFIG));
              return;
            }

            throw error;
          }
        });
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          resolve(cloneStyleConfig(DEFAULT_STYLE_CONFIG));
          return;
        }

        throw error;
      }
    });
  }

  function pickThresholdStyle(value, thresholds) {
    const sorted = thresholds || [];
    for (const threshold of sorted) {
      if (value >= threshold.min) return threshold.style;
    }
    return sorted[sorted.length - 1]?.style || DEFAULT_STYLE_CONFIG.gradeThresholds[DEFAULT_STYLE_CONFIG.gradeThresholds.length - 1].style;
  }

  function styleForGradeAverage(avg) {
    if (avg === null) return DEFAULT_STYLE_CONFIG.gradeThresholds[DEFAULT_STYLE_CONFIG.gradeThresholds.length - 1].style;
    return pickThresholdStyle(avg, styleConfig.gradeThresholds);
  }

  function styleForPointRatio(ratio) {
    if (ratio === null) return DEFAULT_STYLE_CONFIG.pointThresholds[DEFAULT_STYLE_CONFIG.pointThresholds.length - 1].style;
    const percentage = ratio * 100;
    return pickThresholdStyle(percentage, styleConfig.pointThresholds);
  }

  function predictGradeFromValue(value, thresholds) {
    if (value === null || !Number.isFinite(value)) return null;

    const sorted = Array.isArray(thresholds)
      // Select the highest threshold that still matches the value.
      ? [...thresholds].sort((a, b) => {
        if (b.min !== a.min) return b.min - a.min;
        return b.grade - a.grade;
      })
      : [];

    for (const threshold of sorted) {
      if (value >= threshold.min) return threshold.grade;
    }

    return sorted[sorted.length - 1]?.grade || 1;
  }

  function styleForPredictedGrade(grade) {
    const key = String(grade);
    return styleConfig.predictedGradeStyles?.[key]
      || DEFAULT_STYLE_CONFIG.predictedGradeStyles[key]
      || DEFAULT_STYLE_CONFIG.predictedGradeStyles["1"];
  }

  function applyBadgeStyle(badge, style) {
    badge.style.backgroundColor = style.background;
    badge.style.color = style.text;
    badge.style.borderColor = style.border;
  }

  function refreshExistingBadges() {
    const badges = document.querySelectorAll("span.lav-badge[data-lav-kind]");
    for (const badge of badges) {
      const value = parseFloat(badge.dataset.lavValue || "");
      if (!Number.isFinite(value)) continue;

      if (badge.dataset.lavKind === "grade") {
        applyBadgeStyle(badge, styleForGradeAverage(value));
      } else if (badge.dataset.lavKind === "point") {
        applyBadgeStyle(badge, pickThresholdStyle(value, styleConfig.pointThresholds));
      } else if (badge.dataset.lavKind === "predicted") {
        const roundedGrade = Math.round(value);
        applyBadgeStyle(badge, styleForPredictedGrade(roundedGrade));
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Parses a grade string like "4", "5+", "3-", "4+" into a numeric value.
   * Returns null if the grade is a special symbol or unparseable.
   */
  function parseGrade(gradeText) {
    const text = gradeText.trim().toLowerCase();
    if (SPECIAL_GRADES.has(text)) return null;
    if (text.includes("/")) return null;

    // Strip trailing +/-
    const base = parseFloat(text.replace(/[+-]$/, ""));
    if (isNaN(base)) return null;

    if (text.endsWith("+")) return base + styleConfig.gradeModifiers.plus;
    if (text.endsWith("-")) return base + styleConfig.gradeModifiers.minus;
    return base;
  }

  /**
   * Rounds a number to 2 decimal places.
   */
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Formats an average for display, e.g. "4.33".
   */
  function formatAvg(avg) {
    if (avg === null) return "—";
    return avg.toFixed(2);
  }

  /**
   * Parses a point grade string like "10/12" or "44.10/60".
   * Returns null when the value is not a valid non-zero denominator fraction.
   */
  function parsePointFraction(gradeText) {
    const text = gradeText.trim().replace(/,/g, ".");
    const match = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const scored = parseFloat(match[1]);
    const max = parseFloat(match[2]);
    if (!Number.isFinite(scored) || !Number.isFinite(max) || max <= 0) return null;

    return { scored, max };
  }

  /**
   * Formats point-based average as percentage.
   */
  function formatPointAvg(ratio) {
    return `${(ratio * 100).toFixed(1)}%`;
  }

  // ─── Grade extraction ──────────────────────────────────────────────────────

  /**
   * Given a detail table row (tr.detail-grades), extracts:
   * - gradeText: the displayed grade
   * - countsToAvg: whether aktywne.png is present (counts toward average)
   * - weight: the numeric weight (default 1 if not shown)
   * - period: "1" or "2" based on which period header precedes this row
   */
  function extractDetailRows(subjectDetailTable) {
    const rows = subjectDetailTable.querySelectorAll("tr");
    const gradeData = { period1: [], period2: [] };

    let currentPeriod = null;

    for (const row of rows) {
      // Detect period separator rows (bold rows with "Okres 1" or "Okres 2")
      if (row.classList.contains("bolded")) {
        const text = row.textContent.trim();
        if (text.includes("Okres 1")) currentPeriod = "period1";
        else if (text.includes("Okres 2")) currentPeriod = "period2";
        continue;
      }

      if (!currentPeriod) continue;
      if (!row.classList.contains("detail-grades")) continue;

      const cells = row.querySelectorAll("td");
      if (cells.length < 7) continue;

      const gradeText = cells[0].textContent.trim();
      const category = (cells[2]?.textContent || "").trim().toLowerCase();

      // Skip semester/annual grades (they are summaries, not individual grades)
      if (
        category.includes("śródroczna") ||
        category.includes("roczna") ||
        category.includes("przewidywana")
      ) continue;

      // Check if this grade counts toward average (aktywne.png = yes, nieaktywne.png = no)
      const imgSrc = cells[5]?.querySelector("img")?.getAttribute("src") || "";
      const countsToAvg = imgSrc.includes("aktywne.png") && !imgSrc.includes("nieaktywne");

      // Extract weight from the 7th cell (index 6)
      const weightText = cells[6]?.textContent.trim();
      const weight = weightText ? parseFloat(weightText) : 1;

      const value = parseGrade(gradeText);

      gradeData[currentPeriod].push({
        gradeText,
        value,
        countsToAvg,
        weight: isNaN(weight) ? 1 : weight,
      });
    }

    return gradeData;
  }

  /**
   * Calculates a weighted average from an array of {value, weight} objects.
   * Only includes entries where value is non-null.
   * Returns null if no valid grades exist.
   */
  function calcWeightedAverage(grades) {
    let totalWeight = 0;
    let weightedSum = 0;
    let count = 0;

    for (const g of grades) {
      if (!g.countsToAvg) continue;
      if (g.value === null) continue;
      weightedSum += g.value * g.weight;
      totalWeight += g.weight;
      count++;
    }

    if (count === 0) return null;
    return round2(weightedSum / totalWeight);
  }

  /**
   * Extracts point-grade entries from the visible period cell.
   * Includes only entries with "Licz do wyniku: TAK" when this flag is present.
   */
  function extractPointEntriesFromCell(cell) {
    const entries = [];
    const anchors = cell.querySelectorAll("a");

    for (const anchor of anchors) {
      const parsed = parsePointFraction(anchor.textContent || "");
      if (!parsed) continue;

      const title = anchor.getAttribute("title") || "";
      const hasCountFlag = /Licz do wyniku:/i.test(title);
      if (hasCountFlag && /Licz do wyniku:\s*NIE/i.test(title)) continue;
      if (hasCountFlag && !/Licz do wyniku:\s*TAK/i.test(title)) continue;

      entries.push(parsed);
    }

    return entries;
  }

  /**
   * Calculates a point ratio from entries {scored, max}.
   */
  function calcPointRatio(entries) {
    let scoredSum = 0;
    let maxSum = 0;

    for (const entry of entries) {
      scoredSum += entry.scored;
      maxSum += entry.max;
    }

    if (maxSum <= 0 || entries.length === 0) return null;
    return scoredSum / maxSum;
  }

  // ─── DOM manipulation ──────────────────────────────────────────────────────

  /**
   * Finds the hidden detail table for a given subject row.
   * The detail row immediately follows the subject row and has an id like "przedmioty_XXXXX".
   */
  function findDetailTable(subjectRow) {
    // The subject row has an onclick on the img that calls showHide.ShowHide(id)
    const img = subjectRow.querySelector("img[id$='_node']");
    if (!img) return null;

    const nodeId = img.id; // e.g. "przedmioty_86598_node"
    const detailId = nodeId.replace("_node", ""); // e.g. "przedmioty_86598"
    const detailRow = document.getElementById(detailId);
    if (!detailRow) return null;

    return detailRow.querySelector("table.stretch");
  }

  /**
   * Replaces the "średnia disabled" image cell with a computed average badge.
   * Finds cells containing the helper-icon img with "wyłączony przez administratora" title.
   */
  function replaceDisabledAvgCell(td, avg, label) {
    // Clear the existing content (the "disabled" image)
    td.innerHTML = "";
    td.classList.add("center");

    // Keep the field empty when average is unavailable.
    if (avg === null) return;

    const badge = document.createElement("span");
    badge.className = "lav-badge";
    badge.title = `${label}: ${formatAvg(avg)} (${CALCULATED_BY_LABEL})`;
    badge.textContent = formatAvg(avg);
    badge.dataset.lavKind = "grade";
    badge.dataset.lavValue = String(avg);

    applyBadgeStyle(badge, styleForGradeAverage(avg));

    td.appendChild(badge);
  }

  /**
   * Replaces predicted-grade placeholder with a computed predicted grade badge.
   */
  function replacePredictedGradeCell(td, grade, label) {
    if (!td) return;
    if (td.querySelector("span.grade-box")) return;
    if (grade === null) return;

    const text = (td.textContent || "").trim();
    const hasHelperIcon = td.querySelector("img.helper-icon") !== null;
    const hasExistingLavBadge = td.querySelector("span.lav-badge[data-lav-kind='predicted']") !== null;
    const canReplace = hasExistingLavBadge || hasHelperIcon || text === "-" || text === "" || text === "&nbsp;";
    if (!canReplace) return;

    td.innerHTML = "";
    td.classList.add("center");

    const badge = document.createElement("span");
    badge.className = "lav-badge";
    badge.title = `${label}: ${grade} (${CALCULATED_BY_LABEL})`;
    badge.textContent = String(grade);
    badge.dataset.lavKind = "predicted";
    badge.dataset.lavValue = String(grade);

    applyBadgeStyle(badge, styleForPredictedGrade(grade));
    td.appendChild(badge);
  }

  /**
   * Ensures point-grades table has average columns similar to regular grades.
   */
  function ensurePointAverageColumns(pointTable) {
    if (!pointTable) return;
    if (pointTable.dataset.lavPointAvgColumns === "1") return;

    const headerRows = pointTable.querySelectorAll("thead tr");
    if (headerRows.length < 2) return;

    const topRow = headerRows[0];
    const bottomRow = headerRows[1];

    const groupedHeaders = topRow.querySelectorAll("td.colspan");
    if (groupedHeaders.length >= 3) {
      groupedHeaders[0].setAttribute("colspan", "4");
      groupedHeaders[1].setAttribute("colspan", "3");
      groupedHeaders[2].setAttribute("colspan", "3");
    }

    const period1PredHeader = bottomRow.children[1];
    const period2FinalHeader = bottomRow.children[4];
    const yearPredHeader = bottomRow.children[5];
    if (!period1PredHeader || !period2FinalHeader || !yearPredHeader) return;

    const period1AvgHeader = document.createElement("td");
    period1AvgHeader.className = "center lav-point-avg-header";
    period1AvgHeader.title = "Średnia punktów z pierwszego okresu";
    period1AvgHeader.textContent = "Śr.I";

    const period2AvgHeader = document.createElement("td");
    period2AvgHeader.className = "center lav-point-avg-header";
    period2AvgHeader.title = "Średnia punktów z drugiego okresu";
    period2AvgHeader.textContent = "Śr.II";

    const yearAvgHeader = document.createElement("td");
    yearAvgHeader.className = "center lav-point-avg-header";
    yearAvgHeader.title = "Średnia punktów z całego roku";
    yearAvgHeader.textContent = "Śr.R";

    bottomRow.insertBefore(period1AvgHeader, period1PredHeader);
    bottomRow.insertBefore(period2AvgHeader, period2FinalHeader);
    bottomRow.insertBefore(yearAvgHeader, yearPredHeader);

    pointTable.dataset.lavPointAvgColumns = "1";
  }

  /**
   * Ensures a point-grade subject row has dedicated cells for averages.
   */
  function ensurePointAverageCells(subjectRow, nodeCellIndex) {
    if (
      subjectRow.querySelector("td.lav-point-avg-cell-1") &&
      subjectRow.querySelector("td.lav-point-avg-cell-2") &&
      subjectRow.querySelector("td.lav-point-avg-cell-year")
    ) return;

    const cells = Array.from(subjectRow.querySelectorAll("td"));
    const period1PredCell = cells[nodeCellIndex + 3];
    const period2FinalCell = cells[nodeCellIndex + 6];
    const yearPredCell = cells[nodeCellIndex + 7];
    if (!period1PredCell || !period2FinalCell || !yearPredCell) return;

    const period1AvgCell = document.createElement("td");
    period1AvgCell.className = "center lav-point-avg-cell lav-point-avg-cell-1";

    const period2AvgCell = document.createElement("td");
    period2AvgCell.className = "center lav-point-avg-cell lav-point-avg-cell-2";

    const yearAvgCell = document.createElement("td");
    yearAvgCell.className = "center lav-point-avg-cell lav-point-avg-cell-year";

    subjectRow.insertBefore(period1AvgCell, period1PredCell);
    subjectRow.insertBefore(period2AvgCell, period2FinalCell);
    subjectRow.insertBefore(yearAvgCell, yearPredCell);
  }

  /**
   * Renders a point average badge in a dedicated average cell.
   */
  function replacePointAvgCell(targetCell, ratio, label) {
    targetCell.innerHTML = "";
    if (ratio === null) return;

    const gradeEquivalent = round2(ratio * 6);
    const percentage = ratio * 100;
    const badge = document.createElement("span");
    badge.className = "lav-badge";
    badge.title = `${label}: ${formatPointAvg(ratio)} (~${gradeEquivalent.toFixed(2)} / 6.00) (${CALCULATED_BY_LABEL})`;
    badge.textContent = formatPointAvg(ratio);
    badge.dataset.lavKind = "point";
    badge.dataset.lavValue = String(percentage);

    applyBadgeStyle(badge, styleForPointRatio(ratio));

    targetCell.appendChild(badge);
  }

  /**
   * Calculates and injects point averages into dedicated average columns.
   */
  function processPointSubjectRow(subjectRow) {
    const pointTable = subjectRow.closest("table.decorated");
    ensurePointAverageColumns(pointTable);

    const initialCells = Array.from(subjectRow.querySelectorAll("td"));
    const nodeImg = subjectRow.querySelector("img[id$='_node']");
    if (!nodeImg || initialCells.length === 0) return;

    const nodeCellIndex = initialCells.findIndex((cell) => cell.contains(nodeImg));
    if (nodeCellIndex < 0) return;

    ensurePointAverageCells(subjectRow, nodeCellIndex);

    const cells = Array.from(subjectRow.querySelectorAll("td"));
    const period1Cell = cells[nodeCellIndex + 2];
    const period1AvgCell = cells[nodeCellIndex + 3];
    const period2Cell = cells[nodeCellIndex + 6];
    const period2AvgCell = cells[nodeCellIndex + 7];
    const yearAvgCell = cells[nodeCellIndex + 9];
    const period1PredCell = cells[nodeCellIndex + 5];
    const yearPredCell = cells[nodeCellIndex + 11];
    if (!period1Cell || !period1AvgCell || !period2Cell || !period2AvgCell || !yearAvgCell) return;

    const period1Entries = extractPointEntriesFromCell(period1Cell);
    const period2Entries = extractPointEntriesFromCell(period2Cell);

    const period1Avg = calcPointRatio(period1Entries);
    const period2Avg = calcPointRatio(period2Entries);
    const yearAvg = calcPointRatio([...period1Entries, ...period2Entries]);
    const period1Predicted = predictGradeFromValue(period1Avg === null ? null : (period1Avg * 100), styleConfig.predictedPointThresholds);
    const yearPredicted = predictGradeFromValue(yearAvg === null ? null : (yearAvg * 100), styleConfig.predictedPointThresholds);

    replacePointAvgCell(period1AvgCell, period1Avg, "Śr. okresu 1 (punkty)");
    replacePointAvgCell(period2AvgCell, period2Avg, "Śr. okresu 2 (punkty)");
    replacePointAvgCell(yearAvgCell, yearAvg, "Śr. roczna (punkty)");
    replacePredictedGradeCell(period1PredCell, period1Predicted, "Przewidywana ocena śródroczna");
    replacePredictedGradeCell(yearPredCell, yearPredicted, "Przewidywana ocena roczna");
  }

  /**
   * Injects the computed averages into the "Śr.I" and "Śr.II" cells
   * of a subject row in the main decorated table.
   */
  function injectAveragesIntoRow(subjectRow, avg1, avg2, avgTotal, predicted1, predictedYear) {
    const cells = Array.from(subjectRow.querySelectorAll("td"));
    const nodeImg = subjectRow.querySelector("img[id$='_node']");
    const replacedCells = new Set();

    function replaceByIndex(index, avg, label) {
      const cell = cells[index];
      if (!cell) return;

      const img = cell.querySelector("img.helper-icon");
      const existingBadge = cell.querySelector("span.lav-badge[data-lav-kind='grade']");
      if (!img && !existingBadge) return;

      const title = img ? (img.getAttribute("title") || img.getAttribute("alt") || "") : "";
      if (img && !title.includes("wyłączony przez administratora")) return;

      replaceDisabledAvgCell(cell, avg, label);
      replacedCells.add(cell);
    }

    // In the standard grades table, average columns are fixed relative to the node column.
    // This keeps period 1/2/year averages separated even when td titles are missing.
    if (nodeImg) {
      const nodeCellIndex = cells.findIndex((cell) => cell.contains(nodeImg));
      if (nodeCellIndex >= 0) {
        replaceByIndex(nodeCellIndex + 3, avg1, "Śr. okresu 1");
        replacePredictedGradeCell(cells[nodeCellIndex + 5], predicted1, "Przewidywana ocena śródroczna");
        replaceByIndex(nodeCellIndex + 7, avg2, "Śr. okresu 2");
        replaceByIndex(nodeCellIndex + 9, avgTotal, "Śr. roczna");
        replacePredictedGradeCell(cells[nodeCellIndex + 11], predictedYear, "Przewidywana ocena roczna");
      }
    }

    // Fallback for unexpected table variants where columns may differ.
    for (const td of cells) {
      if (replacedCells.has(td)) continue;

      const img = td.querySelector("img.helper-icon");
      const existingBadge = td.querySelector("span.lav-badge[data-lav-kind='grade']");
      if (!img && !existingBadge) continue;

      const rawTitle = img ? (img.getAttribute("title") || img.getAttribute("alt") || "") : "";
      if (img && !rawTitle.includes("wyłączony przez administratora")) continue;

      const title = rawTitle.toLowerCase();
      const tdTitle = (td.getAttribute("title") || "").toLowerCase();

      if (tdTitle.includes("pierwszego okresu") || title.includes("pierwszego okresu")) {
        replaceDisabledAvgCell(td, avg1, "Śr. okresu 1");
      } else if (tdTitle.includes("przewidywana ocena śródroczna") || title.includes("przewidywana ocena śródroczna")) {
        replacePredictedGradeCell(td, predicted1, "Przewidywana ocena śródroczna");
      } else if (tdTitle.includes("drugiego okresu") || title.includes("drugiego okresu")) {
        replaceDisabledAvgCell(td, avg2, "Śr. okresu 2");
      } else if (tdTitle.includes("przewidywana ocena roczna") || title.includes("przewidywana ocena roczna")) {
        replacePredictedGradeCell(td, predictedYear, "Przewidywana ocena roczna");
      } else if (tdTitle.includes("roczna") || title.includes("roczna")) {
        replaceDisabledAvgCell(td, avgTotal, "Śr. roczna");
      }
    }
  }

  // ─── Per-subject processing ────────────────────────────────────────────────

  /**
   * Processes a single subject row: reads detail grades, calculates averages,
   * and injects them into the disabled average cells.
   */
  function processSubjectRow(subjectRow) {
    const detailTable = findDetailTable(subjectRow);
    if (!detailTable) return;

    const { period1, period2 } = extractDetailRows(detailTable);

    const avg1 = calcWeightedAverage(period1);
    const avg2 = calcWeightedAverage(period2);

    // Annual average = weighted average across all grades from both periods
    const allGrades = [...period1, ...period2];
    const avgTotal = calcWeightedAverage(allGrades);
    const predicted1 = predictGradeFromValue(avg1, styleConfig.predictedGradeThresholds);
    const predictedYear = predictGradeFromValue(avgTotal, styleConfig.predictedGradeThresholds);

    injectAveragesIntoRow(subjectRow, avg1, avg2, avgTotal, predicted1, predictedYear);
  }

  // ─── Main orchestration ────────────────────────────────────────────────────

  function main() {
    const subjectRows = document.querySelectorAll("table.decorated tr");

    for (const row of subjectRows) {
      const nodeImg = row.querySelector("img[id$='_node']");
      if (!nodeImg) continue;

      const nodeId = nodeImg.id;
      if (nodeId.endsWith("_all_node")) continue;
      if (nodeId.includes("zachowanie")) continue;

      if (nodeId.startsWith("przedmioty_OP_")) {
        processPointSubjectRow(row);
        continue;
      }

      if (nodeId.startsWith("przedmioty_")) {
        processSubjectRow(row);
      }
    }

    refreshExistingBadges();
  }

  function registerStorageListener() {
    if (!chrome?.storage?.onChanged) return;

    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") return;
        if (!changes[STYLE_CONFIG_STORAGE_KEY]) return;

        applyStyleConfig(changes[STYLE_CONFIG_STORAGE_KEY].newValue);
        refreshExistingBadges();
        main();
      });
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        throw error;
      }
    }
  }

  function registerRuntimeMessageListener() {
    if (!chrome?.runtime?.onMessage) return;

    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type !== "lav-style-config-updated") return;

        applyStyleConfig(message.config);
        refreshExistingBadges();
        main();
      });
    } catch (error) {
      if (!isExtensionContextInvalidatedError(error)) {
        throw error;
      }
    }
  }

  function registerFocusRefreshListener() {
    let isRefreshing = false;

    async function refreshFromStorage() {
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        const loadedConfig = await loadStyleConfig();
        if (!applyStyleConfig(loadedConfig)) return;
        refreshExistingBadges();
        main();
      } catch (error) {
        if (!isExtensionContextInvalidatedError(error)) {
          throw error;
        }
      } finally {
        isRefreshing = false;
      }
    }

    // Fallback refresh when returning from extension popup to the page.
    window.addEventListener("focus", () => {
      void refreshFromStorage();
    });

    // Some browsers restore page activity via visibility instead of focus.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) return;
      void refreshFromStorage();
    });
  }

  function runMainWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(main, 800);
      }, { once: true });
      return;
    }

    // Small delay to let Librus JS finish rendering
    setTimeout(main, 800);
  }

  loadStyleConfig()
    .then((loadedConfig) => {
      applyStyleConfig(loadedConfig);
    })
    .catch((error) => {
      if (!isExtensionContextInvalidatedError(error)) {
        throw error;
      }
    })
    .finally(() => {
      registerStorageListener();
      registerRuntimeMessageListener();
      registerFocusRefreshListener();
      runMainWhenReady();
    });
})();
