// Tolerance for tier boundary continuity (2%).
// Handles float rounding when comparing tier_max (from T1) vs tier_min (from T2).
// Example: T1.max=89.99, T2.min=90 → delta=0.01 < EPSILON → accepted (continuous).
// If comparing unrounded cumplimiento percentages, consider normalizing first.
const EPSILON = 0.02;

const TIER_DEFINITIONS = [
  {
    key: "tramo1",
    label: "Tramo 1",
    minField: "tramo1_min",
    maxField: "tramo1_max",
    pctField: "tramo1_pct",
  },
  {
    key: "tramo2",
    label: "Tramo 2",
    minField: "tramo2_min",
    maxField: "tramo2_max",
    pctField: "tramo2_pct",
  },
  {
    key: "tramo3",
    label: "Tramo 3",
    minField: "tramo3_min",
    maxField: "tramo3_max",
    pctField: "tramo3_pct",
  },
  {
    key: "tramo4",
    label: "Tramo 4",
    minField: "tramo4_min",
    maxField: "tramo4_max",
    pctField: "tramo4_pct",
  },
  {
    key: "tramo5",
    label: "Tramo 5",
    minField: "tramo5_min",
    maxField: null,
    pctField: "tramo5_pct",
  },
];

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAnyTierValue(tier, row) {
  return [tier.minField, tier.maxField, tier.pctField].some((field) => {
    const value = row?.[field];
    return value !== null && value !== undefined && value !== "";
  });
}

function pushIssue(issues, fieldErrors, { code, message, fields = [] }) {
  const issue = { code, message, fields };
  issues.push(issue);
  fields.forEach((field) => {
    if (!fieldErrors[field]) fieldErrors[field] = [];
    fieldErrors[field].push(message);
  });
}

export function getRecaudoTierEntries(row) {
  return TIER_DEFINITIONS.map((tier) => ({
    ...tier,
    min: parseNullableNumber(row?.[tier.minField]),
    max: parseNullableNumber(row?.[tier.maxField]),
    pct: parseNullableNumber(row?.[tier.pctField]),
    configured: hasAnyTierValue(tier, row),
  }));
}

export function validateRecaudoTiers(row) {
  const issues = [];
  const fieldErrors = {};
  const tiers = getRecaudoTierEntries(row);
  const configuredTiers = tiers.filter((tier) => tier.configured);

  if (configuredTiers.length === 0) {
    return {
      isValid: true,
      issues,
      fieldErrors,
      tiers,
    };
  }

  tiers.forEach((tier) => {
    if (!tier.configured) return;

    if (tier.pct != null && tier.pct < 0) {
      pushIssue(issues, fieldErrors, {
        code: `${tier.key}-pct-negative`,
        message: `${tier.label}: el porcentaje no puede ser negativo.`,
        fields: [tier.pctField],
      });
    }

    if (tier.min != null && tier.max != null && tier.min > tier.max + EPSILON) {
      pushIssue(issues, fieldErrors, {
        code: `${tier.key}-min-max`,
        message: `${tier.label}: el desde no puede ser mayor que el hasta.`,
        fields: [tier.minField, tier.maxField],
      });
    }
  });

  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const laterConfigured = tiers
      .slice(index + 1)
      .some((next) => next.configured);

    if (!tier.configured) {
      if (laterConfigured) {
        pushIssue(issues, fieldErrors, {
          code: `${tier.key}-required-before-higher-tier`,
          message: `${tier.label}: completa este tramo antes de usar tramos superiores.`,
          fields: [tier.minField, tier.maxField, tier.pctField],
        });
      }
      continue;
    }

    const next = tiers[index + 1];
    if (!next || !next.configured) continue;

    if (tier.max == null) {
      pushIssue(issues, fieldErrors, {
        code: `${tier.key}-missing-upper-bound`,
        message: `${tier.label}: necesitas definir "Hasta % cumplimiento" para continuar con ${next.label}.`,
        fields: [tier.maxField, next.minField],
      });
      continue;
    }

    if (next.min == null) {
      pushIssue(issues, fieldErrors, {
        code: `${next.key}-missing-lower-bound`,
        message: `${next.label}: necesitas definir "Desde % cumplimiento" para enlazar la escala.`,
        fields: [tier.maxField, next.minField],
      });
      continue;
    }

    const delta = next.min - tier.max;
    if (delta > EPSILON) {
      pushIssue(issues, fieldErrors, {
        code: `${tier.key}-${next.key}-gap`,
        message: `Hay un gap entre ${tier.label} y ${next.label}.`,
        fields: [tier.maxField, next.minField],
      });
    } else if (delta < -EPSILON) {
      pushIssue(issues, fieldErrors, {
        code: `${tier.key}-${next.key}-overlap`,
        message: `Hay un overlap entre ${tier.label} y ${next.label}.`,
        fields: [tier.maxField, next.minField],
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    fieldErrors,
    tiers,
  };
}
