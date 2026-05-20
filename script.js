let characterDataGlobal = null;

const BASE_CHARACTER_AGE = 16;
const BASE_XP = 8000;

const STAGES = [
  "stageOne",
  "stageTwo",
  "stageThree",
  "stageFour",
  "stageFive",
  "stageSix",
  "stageSeven",
  "stageEight",
];

const CHARACTERISTICS = [
  "Str",
  "TG",
  "Dex",
  "Spd",
  "Per",
  "Int",
  "WP",
  "Cha",
  "LK",
];

const characterState = {
  languages: {
    primary: [],
    secondary: [],
  },
  availableLanguages: {
    secondary: [],
  },

  skipStageFour: false,
  skipStageFour: false,
  skipStageFourAge: null,
  skipStageFourSourceLife: null,
  allowedAdultLives: {},
  activeSkipSources: {},
  selectedStageModules: {
    stageFive: [],
    stageSix: [],
  },
  miscellaneous: {
    fateThresholds: [],
    nationalityBonuses: [],
    backgroundBonuses: [],
    professionBonuses: [],
    roleBonuses: [],
    wounds: [],
    maxWealth: [],
    aptitudes: [],
    weaponTrainings: [],
    rolePerks: [],
  },
};

let stageSixInstanceCounter = 0;

const DOM = {};

function cacheDOM() {
  DOM.selectors = document.querySelectorAll(
    ".stage-selector, .dynamic-selector",
  );

  DOM.skillsContainer = document.getElementById("skills-rows-container");

  DOM.talentsContainer = document.getElementById("talents-rows-container");

  DOM.prereqContainer = document.getElementById("prereq-rows-container");

  DOM.xpGained = document.getElementById("ledger-xp-gained");
  DOM.xpBalance = document.getElementById("ledger-xp-balance");
  DOM.characterAge = document.getElementById("ledger-char-age");
  DOM.miscContainer = document.getElementById("misc-rows-container");
}

function debounce(fn, delay = 100) {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

const debouncedRecalc = debounce(calculateTotalStats);

function formatSkillName(skill) {
  return skill
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

function resolveSkillDefinition(skillKey, skillObj = {}) {
  return {
    skillName: skillObj.skill || skillKey,
    label: skillObj.label || skillObj.skill || skillKey,
    amount: parseInt(skillObj.amount || "0", 10),
    requiresCustomPrompt: skillObj.requiresCustomPrompt === true,
  };
}

function createBaseState() {
  return {
    characteristics: Object.fromEntries(
      CHARACTERISTICS.map((stat) => [stat, 0]),
    ),

    skills: {},
    talents: {},
    fieldSkillSources: {},
    restrictedXpPools: [],
    prerequisites: {
      characteristics: {},
      skills: {},
      talents: {},
      forbidden: {},
      fields: {},
      conditional: {},
      special: {},
    },
    fieldSkillTracker: {},

    xpPools: {
      True: 0,
      Characteristic: 0,
      Skill: 0,
      Talent: 0,
      Perks: 0,
    },
    miscellaneous: {
      fateThresholds: [],
      nationalityBonuses: [],
      backgroundBonuses: [],
      professionBonuses: [],
      roleBonuses: [],

      aptitudes: [],

      weaponTrainings: [],

      rolePerks: [],

      wounds: 0,
      maxWealth: 0,
    },

    finalCharacterAge:
      characterState.skipStageFour && characterState.skipStageFourAge
        ? characterState.skipStageFourAge
        : BASE_CHARACTER_AGE,

    totalXpGained:
      characterState.skipStageFour && characterState.skipStageFourAge
        ? BASE_XP + (characterState.skipStageFourAge - BASE_CHARACTER_AGE) * 500
        : BASE_XP,
    totalXpSpent: 0,
  };
}

function updateTitle(selectElement, titleId) {
  const title = document.getElementById(titleId);

  if (!title) return;

  if (selectElement.multiple) {
    const selected = Array.from(selectElement.selectedOptions).map(
      (option) => option.textContent,
    );

    title.textContent = selected.join(", ");
    return;
  }

  const option = selectElement.options[selectElement.selectedIndex];

  if (option) {
    title.textContent = option.textContent;
  }
}

function addSkill(state, name, amount) {
  state.skills[name] = (state.skills[name] || 0) + amount;
}

function addTalent(state, name, amount) {
  state.talents[name] = (state.talents[name] || 0) + amount;
}

function addCharacteristic(state, stat, amount) {
  state.characteristics[stat] = (state.characteristics[stat] || 0) + amount;
}

function applyFixedCharacteristics(state, fixedStats = {}) {
  CHARACTERISTICS.forEach((stat) => {
    const jsonKey = stat === "LK" ? "Lk" : stat;

    addCharacteristic(state, stat, fixedStats[jsonKey] || 0);
  });
}

function applyFixedSkills(state, fixedSkills = {}) {
  Object.entries(fixedSkills).forEach(([skillKey, skillObj]) => {
    const resolved = resolveSkillDefinition(skillKey, skillObj);

    if (resolved.requiresCustomPrompt) {
      return;
    }

    const resolvedSkillKey = resolveDynamicSkill(resolved.skillName, state);

    const formatted = formatSkillName(resolvedSkillKey);

    addSkill(state, formatted, resolved.amount);
  });
}

// makes langage primary and secondary dynamic by changing all future selections reference what was made in stage 1
function resolveDynamicSkill(skillKey, state) {
  if (!skillKey) return skillKey;

  const normalized = skillKey.toLowerCase();

  // PRIMARY
  if (normalized === "primary") {
    const primaryList = state.languages?.primary || [];

    const primary = primaryList[0];

    return primary ? `language/${primary}` : skillKey;
  }

  // language/primary
  if (normalized === "language/primary") {
    const primaryList = state.languages?.primary || [];

    const primary = primaryList[0];

    return primary ? `language/${primary}` : skillKey;
  }

  return skillKey;
}

function applyFixedTalents(state, fixedTalents = {}) {
  Object.entries(fixedTalents).forEach(([talentName, talentObj]) => {
    // skip custom prompt talents
    if (talentObj.requiresCustomPrompt) {
      return;
    }

    const formatted = talentName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    addTalent(state, formatted, parseInt(talentObj.amount || "0", 10));
  });
}

function applyFlexiblePools(state, flexible) {
  if (!flexible) return;

  const amount = parseInt(flexible.amount || "0", 10);

  let types = [];

  if (Array.isArray(flexible.type)) {
    types = flexible.type;
  } else if (typeof flexible.type === "string") {
    types = [flexible.type];
  } else if (typeof flexible.type === "object") {
    types = Object.values(flexible.type);
  }

  types.forEach((type) => {
    let normalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

    if (normalized.endsWith("s") && normalized !== "Perks") {
      normalized = normalized.slice(0, -1);
    }

    if (state.xpPools[normalized] !== undefined) {
      state.xpPools[normalized] += amount;
    }
  });
}

function applyRestrictedFlexibleXp(state, flexibleText) {
  if (!flexibleText || typeof flexibleText !== "string") return;

  // needs work. supposed to make the special use cases of flex xp in adult lives store for user to see easily.

  const totalMatch = flexibleText.match(/\+(\d+)\s*XP/i);
  const restrictedMatch = flexibleText.match(/(\d+)\s*XP must be spent/i);

  if (!totalMatch || !restrictedMatch) return;

  const totalXp = parseInt(totalMatch[1], 10);
  const restrictedXp = parseInt(restrictedMatch[1], 10);

  const unrestrictedXp = totalXp - restrictedXp;

  // identifies types flex xp can be spent on
  let allowedCategories = [];

  const categoryMatch = flexibleText.match(
    /can only be spent on\s+(.+?)(?:\)|$)/i,
  );

  if (categoryMatch) {
    allowedCategories = categoryMatch[1].split("and").map((s) => s.trim());
  }

  let requiredFields = [];

  if (/chosen Skill Fields/i.test(flexibleText)) {
    requiredFields = getSelectedFields();
  }
  const specificFieldMatch = flexibleText.match(
    /character’s\s+(.+?)\s+Skill Fields/i,
  );

  if (specificFieldMatch && !/chosen Skill Fields/i.test(flexibleText)) {
    requiredFields = specificFieldMatch[1].split("or").map((s) => s.trim());
  }
  let fallbackText = "";

  const fallbackMatch = flexibleText.match(
    /if the character has no.+?treat these as (.+?);/i,
  );

  if (fallbackMatch) {
    fallbackText = fallbackMatch[1].trim();
  }

  state.restrictedXpPools.push({
    totalXp,
    restrictedXp,
    unrestrictedXp,
    requiredFields,
    allowedCategories,
    fallbackText,
    originalText: flexibleText,
  });
}

function applyCostAndDuration(state, data) {
  if (data.cost) {
    state.totalXpSpent += parseInt(data.cost, 10);
  }

  if (data.duration) {
    const years = parseInt(String(data.duration).match(/\d+/)?.[0] || "0", 10);

    state.totalXpGained += years * 500;
    state.finalCharacterAge += years;
  }
}

function formatCharacteristicRequirements(characteristics = {}) {
  return Object.entries(characteristics)
    .map(([stat, value]) => `${stat} ${value}`)
    .join(", ");
}

function formatTalentRequirements(talents = {}) {
  const sections = [];

  if (talents.required?.length) {
    sections.push(talents.required.join(", "));
  }

  if (talents.requiredAny?.length) {
    sections.push(talents.requiredAny.join(" or "));
  }

  if (talents.forbidden?.length) {
    sections.push(`Cannot have: ${talents.forbidden.join(", ")}`);
  }

  return sections.join(", ");
}

function formatConditionalCharacteristics(conditionalCharacteristics = []) {
  return conditionalCharacteristics
    .map((entry) => {
      const reductions = (entry.reductions || [])
        .map((reduction) => {
          return `${reduction.value} if ${reduction.ifField}`;
        })
        .join(", ");

      return `${entry.stat} ${entry.default}${
        reductions ? ` (${reductions})` : ""
      }`;
    })
    .join(", ");
}

function formatConditionalBlocks(conditional = []) {
  return conditional
    .map((block) => {
      if (block.display) {
        return block.display;
      }

      const pieces = [];

      if (block.then?.characteristics) {
        pieces.push(
          formatCharacteristicRequirements(block.then.characteristics),
        );
      }

      if (block.then?.talents) {
        pieces.push(formatTalentRequirements(block.then.talents));
      }

      return pieces.join(", ");
    })
    .filter(Boolean)
    .join(" | ");
}

function formatPrerequisite(prerequisite) {
  if (!prerequisite) return "-";

  // evidence that I need to plan json better
  if (typeof prerequisite === "string") {
    return prerequisite;
  }

  const sections = [];

  if (prerequisite.characteristics) {
    sections.push(
      formatCharacteristicRequirements(prerequisite.characteristics),
    );
  }

  if (prerequisite.conditionalCharacteristics) {
    sections.push(
      formatConditionalCharacteristics(prerequisite.conditionalCharacteristics),
    );
  }

  if (prerequisite.talents) {
    sections.push(formatTalentRequirements(prerequisite.talents));
  }

  if (prerequisite.conditional) {
    sections.push(formatConditionalBlocks(prerequisite.conditional));
  }

  return sections.filter(Boolean).join(". ");
}

function addCharacteristicRequirement(state, characteristic, value, source) {
  const existing = state.prerequisites.characteristics[characteristic];

  // looks at prerequisites stored from multiple different sources and only displays the highest one, while storing the sources for both
  if (!existing || value > existing.value) {
    state.prerequisites.characteristics[characteristic] = {
      value,
      usedBy: [source],
    };

    return;
  }

  // if two are tied, it stores the value and the sources for both
  if (value === existing.value) {
    if (!existing.usedBy.includes(source)) {
      existing.usedBy.push(source);
    }
  }
}

function addSkillRequirement(state, skill, value, source) {
  const existing = state.prerequisites.skills[skill];

  if (!existing || value > existing.value) {
    state.prerequisites.skills[skill] = {
      value,
      usedBy: [source],
    };

    return;
  }

  if (value === existing.value) {
    if (!existing.usedBy.includes(source)) {
      existing.usedBy.push(source);
    }
  }
}

function addTalentRequirement(state, talent, source) {
  if (!state.prerequisites.talents[talent]) {
    state.prerequisites.talents[talent] = {
      usedBy: [],
    };
  }

  const entry = state.prerequisites.talents[talent];

  if (!entry.usedBy.includes(source)) {
    entry.usedBy.push(source);
  }
}

function addForbiddenRequirement(state, forbidden, source) {
  if (!state.prerequisites.forbidden[forbidden]) {
    state.prerequisites.forbidden[forbidden] = {
      usedBy: [],
    };
  }

  const entry = state.prerequisites.forbidden[forbidden];

  if (!entry.usedBy.includes(source)) {
    entry.usedBy.push(source);
  }
}

function addSpecialRequirement(state, text, source) {
  if (!state.prerequisites.special[text]) {
    state.prerequisites.special[text] = {
      usedBy: [],
    };
  }

  const entry = state.prerequisites.special[text];

  if (!entry.usedBy.includes(source)) {
    entry.usedBy.push(source);
  }
}

function getSelectedFields() {
  const fields = [];

  document.querySelectorAll(".field-selector").forEach((select) => {
    if (select.value) {
      fields.push(select.value);
    }
  });

  return fields;
}

function addFieldRequirement(state, fieldName, source) {
  if (!state.prerequisites.fields[fieldName]) {
    state.prerequisites.fields[fieldName] = {
      usedBy: [],
    };
  }

  const entry = state.prerequisites.fields[fieldName];

  if (!entry.usedBy.includes(source)) {
    entry.usedBy.push(source);
  }
}

function addConditionalRequirement(state, data) {
  const key = `${data.type}|${data.source}|${data.display || data.fields?.join(",")}`;

  if (!state.prerequisites.conditional[key]) {
    state.prerequisites.conditional[key] = data;
  }
}

//puts all the prereqs together to display
function applyPrerequisite(state, data) {
  const prerequisite = data.prerequisite;

  if (!prerequisite || prerequisite === "-") {
    return;
  }

  const source = data.title;

  // this can probably be deleted
  if (typeof prerequisite === "string") {
    addSpecialRequirement(state, prerequisite, source);
    return;
  }

  if (prerequisite.characteristics) {
    Object.entries(prerequisite.characteristics).forEach(([stat, value]) => {
      addCharacteristicRequirement(state, stat, value, source);
    });
  }

  if (prerequisite.skills) {
    Object.entries(prerequisite.skills).forEach(([skill, value]) => {
      const resolvedSkill = resolveDynamicSkill(skill, state);

      addSkillRequirement(state, formatSkillName(resolvedSkill), value, source);
    });
  }
  if (prerequisite.talents?.required) {
    prerequisite.talents.required.forEach((talent) => {
      addTalentRequirement(state, talent, source);
    });
  }

  if (prerequisite.talents?.forbidden) {
    prerequisite.talents.forbidden.forEach((talent) => {
      addForbiddenRequirement(state, talent, source);
    });
  }

  if (prerequisite.fields?.required) {
    prerequisite.fields.required.forEach((field) => {
      addFieldRequirement(state, field, source);
    });
  }

  if (prerequisite.fields?.requiredAny) {
    addConditionalRequirement(state, {
      type: "requiredAnyField",
      source,
      fields: prerequisite.fields.requiredAny,
    });
  }

  // for literally just NOrth America so far

  if (prerequisite.conditional) {
    prerequisite.conditional.forEach((condition) => {
      addConditionalRequirement(state, {
        type: "display",
        source,
        display: condition.display,
      });
    });
  }
  // Conditional stuff that took way too much time

  if (prerequisite.conditions) {
    const selectedFields = getSelectedFields();

    prerequisite.conditions.forEach((condition) => {
      const requiredFields = condition.if?.fields || [];

      const matches = requiredFields.some((field) =>
        selectedFields.includes(field),
      );

      if (!matches) {
        return;
      }
      if (condition.override?.characteristics) {
        Object.entries(condition.override.characteristics).forEach(
          ([stat, value]) => {
            addCharacteristicRequirement(state, stat, value, source);
          },
        );
      }
      if (condition.display) {
        addConditionalRequirement(state, {
          type: "override",
          source,
          display: condition.display,
        });
      }
    });
  }

  if (prerequisite.special) {
    prerequisite.special.forEach((condition) => {
      addSpecialRequirement(state, condition, source);
    });
  }
}

function applySelectedFields(
  state,
  moduleData,
  repository,
  isRepeatedStageSix = false,
) {
  if (!moduleData.fields) return;

  if (!repository) return;

  const fieldSelectors = document.querySelectorAll(
    ".field-selection-wrapper select",
  );

  fieldSelectors.forEach((select) => {
    const selectedField = select.value;

    if (!selectedField) return;

    const fieldKey = Object.keys(repository).find((key) => {
      return repository[key].title === selectedField;
    });

    if (!fieldKey) return;

    const fieldData = repository[fieldKey];

    // applies fields
    if (fieldData.skills) {
      fieldData.skills.forEach((skill, skillIndex) => {
        let skillName = skill.name;

        // where the 'any' magic happens
        if (skillName.toLowerCase().includes("/any")) {
          const matchingInput = document.querySelector(
            `.field-any-input[data-field-index="${skillIndex}"]`,
          );

          if (matchingInput?.value.trim()) {
            const specialization = matchingInput.value.trim();

            const baseSkill = skillName.split("/")[0];

            skillName = `${baseSkill}/${specialization}`;
          }
        }

        const normalizedSkill = skillName.trim().toLowerCase();

        const alreadyGranted =
          state.fieldSkillTracker[normalizedSkill] || false;

        let amountToGrant = isRepeatedStageSix
          ? Math.floor(skill.amount / 2)
          : skill.amount;

        // duplicate skills from fields get halved
        if (alreadyGranted) {
          amountToGrant = 25;
        }

        addSkill(state, skillName, amountToGrant);
        registerFieldSkill(state, skillName, fieldData.title);

        state.fieldSkillTracker[normalizedSkill] = true;
      });
    }

    // field xp cost gets applied
    if (fieldData.cost) {
      state.totalXpSpent += parseInt(fieldData.cost || 0, 10);
    }

    // field prereqs are pushed to prereqs spot
    if (fieldData.prerequisite && fieldData.prerequisite !== "-") {
      applyPrerequisite(state, {
        title: fieldData.title,
        prerequisite: fieldData.prerequisite,
      });
    }
  });
}

function applyModuleFieldDurations(state, moduleData, containerElement = null) {
  if (!moduleData?.fields || !containerElement) return;

  const fieldSelectors = containerElement.querySelectorAll(
    ".field-selection-wrapper select",
  );

  fieldSelectors.forEach((selector) => {
    const selectedValue = selector.value;

    if (!selectedValue) return;

    for (const [fieldType, fieldData] of Object.entries(moduleData.fields)) {
      if (!fieldData.options.includes(selectedValue)) continue;

      const duration = Number(fieldData.duration || 0);

      state.finalCharacterAge += duration;
      state.totalXpGained += duration * 500;
    }
  });
}

function applyMiscellaneous(state, moduleData) {
  if (!moduleData) return;

  const misc = state.miscellaneous;

  // FATE THRESHOLD
  if (moduleData.fateThreshold) {
    misc.fateThresholds.push(moduleData.fateThreshold);
  }

  // NATIONALITY BONUS
  if (moduleData.nationalityBonus) {
    if (Array.isArray(moduleData.nationalityBonus)) {
      misc.nationalityBonuses.push(...moduleData.nationalityBonus);
    } else if (moduleData.nationalityBonus.text) {
      misc.nationalityBonuses.push(moduleData.nationalityBonus.text);
    }
  }

  // BACKGROUND BONUS
  if (moduleData.backgroundBonus) {
    misc.backgroundBonuses.push(moduleData.backgroundBonus);
  }

  // PROFESSION BONUS
  if (moduleData.professionBonus) {
    misc.professionBonuses.push(moduleData.professionBonus);
  }

  // ROLE BONUS
  if (moduleData.roleBonus) {
    misc.roleBonuses.push(moduleData.roleBonus);
  }

  // WOUNDS
  if (moduleData.wounds) {
    misc.wounds += Number(moduleData.wounds);
  }

  // MAX WEALTH
  if (moduleData.maxWealth) {
    misc.maxWealth += Number(moduleData.maxWealth);
  }

  // STATIC APTITUDES
  if (moduleData.aptitudes) {
    misc.aptitudes.push(...moduleData.aptitudes);
  }

  // STATIC WEAPON TRAINING
  if (moduleData.weaponTraining) {
    misc.weaponTrainings.push(...moduleData.weaponTraining);
  }

  // STATIC ROLE PERK
  if (moduleData.rolePerk) {
    misc.rolePerks.push(moduleData.rolePerk);
  }
}

function processModuleData(
  state,
  moduleData,
  isRepeatedStageSix = false,
  suppressDuration = false,
  containerElement = null,
) {
  if (!moduleData) return;

  // REPEATED STAGE SIX
  if (isRepeatedStageSix) {
    if (moduleData.duration) {
      const years = parseFloat(moduleData.duration) / 2;

      state.finalCharacterAge += years;
      state.totalXpGained += years * 500;
    }
  }

  // NORMAL DURATION HANDLING
  else if (!suppressDuration) {
    // ONLY APPLY FIELD DURATIONS
    // WHEN DURATION IS NOT SUPPRESSED
    applyModuleFieldDurations(state, moduleData, containerElement);

    applyCostAndDuration(state, moduleData);
  }

  // SUPPRESSED DURATION
  else {
    // Intentionally do nothing.
    // Age is already anchored by skipStageFourAge.
  }

  applyPrerequisite(state, moduleData);

  applyMiscellaneous(state, moduleData);

  // STORE LANGUAGE DATA
  if (moduleData.languages) {
    state.languages = {
      primary: moduleData.languages.primary || [],
      secondary: moduleData.languages.secondary || [],
    };
  }

  // FLEX XP
  if (!isRepeatedStageSix) {
    applyFlexiblePools(state, moduleData.flexible);

    if (moduleData.restrictedFlexibleXp) {
      applyRestrictedFlexibleXp(state, moduleData.restrictedFlexibleXp);
    }
  }

  // CHARACTERISTICS
  if (!isRepeatedStageSix) {
    applyFixedCharacteristics(state, moduleData.fixed?.characteristics);
  }

  // SKILLS
  if (moduleData.fixed?.skills) {
    const adjustedSkills = {};

    Object.entries(moduleData.fixed.skills).forEach(([key, value]) => {
      adjustedSkills[key] = {
        ...value,
        amount: isRepeatedStageSix
          ? Math.floor((value.amount || 0) / 2)
          : value.amount,
      };
    });

    applyFixedSkills(state, adjustedSkills);
  }

  // TALENTS
  if (!isRepeatedStageSix) {
    applyFixedTalents(state, moduleData.fixed?.talents);
  }

  // FIELDS
  applySelectedFields(
    state,
    moduleData,
    characterDataGlobal.stageFive.fieldsRepository,
    isRepeatedStageSix,
  );
}

function resolveLanguageReference(value, state) {
  if (!value) return value;

  const normalized = value.toLowerCase();

  if (normalized === "primary") {
    return state.languages?.primary?.[0] || "Unknown";
  }

  if (normalized === "secondary") {
    return state.languages?.secondary || [];
  }

  return value;
}

function processSelections(state) {
  //dynamic skills here get preloaded, but really just language

  document.querySelectorAll(".dynamic-selector").forEach((selector) => {
    const languageType = selector.dataset.languageType;

    if (!languageType) return;

    let languageValue = selector.value;

    const section = selector.closest(".language-section");

    const customInput = section?.querySelector(".language-custom-input");

    if (languageValue === "Any" && customInput?.value.trim()) {
      languageValue = customInput.value.trim();
    }

    if (!languageValue) return;

    if (!state.languages) {
      state.languages = {
        primary: [],
        secondary: [],
      };
    }

    if (!state.languages[languageType]) {
      state.languages[languageType] = [];
    }

    state.languages[languageType] = [languageValue];
  });

  ["stageFive", "stageSix"].forEach((stageKey) => {
    const selectedModules = characterState.selectedStageModules[stageKey] || [];

    selectedModules.forEach((moduleInfo) => {
      const moduleCard = document.querySelector(
        `[data-module-key="${moduleInfo.key}"]`,
      );

      processModuleData(
        state,
        moduleInfo.data,
        moduleInfo.isRepeat === true,
        false,
        moduleCard,
      );
    });
  });
  DOM.selectors.forEach((selector) => {
    if (selector.classList.contains("dynamic-selector")) {
      const value = selector.value;

      if (!value) return;

      const amount = parseInt(selector.dataset.amount || "0", 10);

      const type = selector.dataset.choiceType;

      const languageType = selector.dataset.languageType;

      if (languageType) {
        let languageValue = selector.value;

        const section = selector.closest(".language-section");

        const customInput = section?.querySelector(".language-custom-input");

        if (languageValue === "Any" && customInput?.value.trim()) {
          languageValue = customInput.value.trim();
        }

        if (languageValue) {
          if (!state.languages) {
            state.languages = {
              primary: [],
              secondary: [],
            };
          }

          if (!state.languages[languageType]) {
            state.languages[languageType] = [];
          }

          state.languages[languageType] = [languageValue];

          addSkill(state, `Language/${languageValue}`, 100);
        }

        return;
      }

      if (type === "characteristicChoices") {
        addCharacteristic(state, value, amount);
      }

      if (type === "skillChoices") {
        const choiceId = selector.dataset.choiceId;

        // CHECK IF THIS SKILL HAS A CUSTOM PROMPT
        const customInput = document.querySelector(
          `.custom-choice-input[data-parent-select-id="${choiceId}"]`,
        );

        // IF CUSTOM EXISTS AND HAS VALUE,
        // DO NOT ADD BASE SKILL
        if (customInput?.value.trim()) {
          return;
        }

        let resolvedSkill = resolveDynamicSkill(value, state);

        // LANGUAGE CHOICE SPECIAL CASE
        if (
          selector.closest(".dynamic-block")?.querySelector("label")
            ?.textContent === "Language"
        ) {
          resolvedSkill = `Language/${resolvedSkill}`;
        }

        addSkill(state, formatSkillName(resolvedSkill), amount);
      }
      if (type === "talentChoices") {
        const requiresCustom = selector.dataset.requiresCustomPrompt === "true";

        // non-custom talents
        if (!requiresCustom) {
          addTalent(state, value, amount);
        }
      }

      if (type === "pairedTalentChoices") {
        const selectedOption = selector.options[selector.selectedIndex];

        const positiveTalent = selectedOption.dataset.positiveTalent;

        const positiveAmount = parseInt(
          selectedOption.dataset.positiveAmount || "0",
          10,
        );

        const negativeTalent = selectedOption.dataset.negativeTalent;

        const negativeAmount = parseInt(
          selectedOption.dataset.negativeAmount || "0",
          10,
        );

        if (positiveTalent) {
          addTalent(state, positiveTalent, positiveAmount);
        }

        if (negativeTalent) {
          addTalent(state, negativeTalent, negativeAmount);
        }
      }

      if (type === "aptitudeChoices") {
        state.miscellaneous.aptitudes.push(value);
      }

      if (type === "weaponTrainingChoices") {
        state.miscellaneous.weaponTrainings.push(value);
      }

      if (type === "rolePerkChoices") {
        state.miscellaneous.rolePerks.push(value);
      }

      const selectedOption = selector.options[selector.selectedIndex];

      if (selectedOption?.subDataRef) {
        const data = JSON.parse(selectedOption.subDataRef);

        processModuleData(state, data);
      }

      return;
    }

    const selectedOptions = Array.from(selector.selectedOptions || []);

    selectedOptions.forEach((option) => {
      if (
        selector.closest('[data-stage="stageFive"]') ||
        selector.closest('[data-stage="stageSix"]')
      ) {
        return;
      }
      if (characterState.skipStageFour && option.dataset?.skipAge) {
        characterState.skipStageFourAge = parseInt(option.dataset.skipAge, 10);
      }

      if (!option.subDataRef) return;

      const data = JSON.parse(option.subDataRef);

      // Store stage selections globally
      if (!state.stageSelections) {
        state.stageSelections = {};
      }

      const stageKey = selector.closest(".slot")?.dataset.stage;

      if (stageKey) {
        state.stageSelections[stageKey] = option.value;
      }

      const suppressDuration =
        stageKey === "stageFour" && characterState.skipStageFour;

      processModuleData(
        state,
        data,
        false,
        suppressDuration,
        selector.closest(".slot"),
      );
    });
  });
}

function processCustomInputs(state) {
  const customInputs = document.querySelectorAll(".custom-choice-input");

  customInputs.forEach((input) => {
    const value = input.value.trim();

    if (!value) return;

    const amount = parseInt(input.dataset.amount || "0", 10);

    const choiceType = input.dataset.choiceType;

    // for custom skills

    if (input.dataset.baseSkill) {
      const baseSkill = input.dataset.baseSkill;

      const formatted = value.charAt(0).toUpperCase() + value.slice(1);

      addSkill(state, formatSkillName(`${baseSkill}/${formatted}`), amount);

      return;
    }

    // for custom talents

    if (input.dataset.baseTalent) {
      const baseTalent = input.dataset.baseTalent;

      const formatted = value.charAt(0).toUpperCase() + value.slice(1);

      addTalent(state, `${baseTalent}: ${formatted}`, amount);

      return;
    }
  });
}

function registerFieldSkill(state, skillName, fieldName) {
  const normalized = skillName.trim().toLowerCase();

  if (!state.fieldSkillSources[normalized]) {
    state.fieldSkillSources[normalized] = new Set();
  }

  state.fieldSkillSources[normalized].add(fieldName);
}

function calculateCharacteristicScore(points) {
  let finalScore = 20;
  let leftoverPoints = 0;

  if (points >= 0) {
    if (points <= 200) {
      finalScore += Math.floor(points / 20);
      leftoverPoints = points % 20;
    } else {
      const remaining = points - 200;

      finalScore = 30 + Math.floor(remaining / 30);

      leftoverPoints = remaining % 30;
    }
  } else {
    finalScore += Math.floor(points / 10);

    leftoverPoints = ((points % 10) + 10) % 10;
  }

  return {
    finalScore,
    leftoverPoints,
  };
}

function renderCharacteristics(state) {
  CHARACTERISTICS.forEach((stat) => {
    const points = state.characteristics[stat];

    const { finalScore, leftoverPoints } = calculateCharacteristicScore(points);

    const element = document.getElementById(`stat-${stat}`);

    if (!element) return;

    element.textContent = `${finalScore} (+${leftoverPoints} XP)`;

    element.title = `Total Net Points Pool: ${points}`;
  });
}

function renderSkills(state) {
  if (!DOM.skillsContainer) return;

  DOM.skillsContainer.innerHTML = "";

  const fragment = document.createDocumentFragment();

  const sortedSkills = Object.entries(state.skills).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  if (sortedSkills.length === 0) {
    DOM.skillsContainer.innerHTML =
      '<div class="no-skills-notice">No skills acquired yet.</div>';

    return;
  }

  sortedSkills.forEach(([name, points]) => {
    const normalized = name.trim().toLowerCase();

    const fieldSources = state.fieldSkillSources[normalized];
    const row = document.createElement("div");

    row.className = "stat-row";

    if (fieldSources?.size) {
      row.classList.add("field-skill-row");
    }

    const sourceText = fieldSources?.size
      ? `<div class="field-skill-tag">
       ${Array.from(fieldSources).join(", ")}
     </div>`
      : "";

    row.innerHTML = `
  <div class="skill-main">
    <span>${name}</span>
    ${sourceText}
  </div>

  <strong>${points >= 0 ? "+" : ""}${points}</strong>
`;

    fragment.appendChild(row);
  });

  DOM.skillsContainer.appendChild(fragment);
}

function renderTalents(state) {
  if (!DOM.talentsContainer) return;

  DOM.talentsContainer.innerHTML = "";

  const fragment = document.createDocumentFragment();

  const sortedTalents = Object.entries(state.talents).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  if (sortedTalents.length === 0) {
    DOM.talentsContainer.innerHTML =
      '<div class="no-talents-notice">No talents acquired yet.</div>';

    return;
  }

  sortedTalents.forEach(([name, points]) => {
    const row = document.createElement("div");

    row.className = "stat-row";

    row.innerHTML = `
      <span>${name}</span>
      <strong>${points >= 0 ? "+" : ""}${points}</strong>
    `;

    fragment.appendChild(row);
  });

  DOM.talentsContainer.appendChild(fragment);
}

function renderMiscellaneous(state) {
  const container = DOM.miscContainer;

  if (!container) return;

  container.innerHTML = "";

  const misc = state.miscellaneous;

  const rows = [];

  // FATE THRESHOLDS
  if (misc.fateThresholds.length) {
    rows.push(["Fate Threshold", misc.fateThresholds.join(", ")]);
  }

  // WOUNDS
  rows.push(["Wounds", `1d5 + ${misc.wounds}`]);

  // MAX WEALTH
  rows.push(["Max Wealth", `+${misc.maxWealth}`]);

  // APTITUDES
  if (misc.aptitudes.length) {
    rows.push(["Aptitudes", misc.aptitudes.join(", ")]);
  }

  // WEAPON TRAINING
  if (misc.weaponTrainings.length) {
    rows.push(["Weapon Training", misc.weaponTrainings.join(", ")]);
  }

  // ROLE PERKS
  if (misc.rolePerks.length) {
    rows.push(["Perks", misc.rolePerks.join(", ")]);
  }

  // TEXT BONUSES

  misc.nationalityBonuses.forEach((bonus) => {
    rows.push(["Nationality Bonus", bonus]);
  });

  misc.backgroundBonuses.forEach((bonus) => {
    rows.push(["Background Bonus", bonus]);
  });

  misc.professionBonuses.forEach((bonus) => {
    rows.push(["Profession Bonus", bonus]);
  });

  misc.roleBonuses.forEach((bonus) => {
    rows.push(["Role Bonus", bonus]);
  });

  if (!rows.length) {
    container.innerHTML = `<div class="no-data-notice">No miscellaneous data yet.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "misc-row";

    const labelDiv = document.createElement("div");
    labelDiv.className = "misc-label";
    labelDiv.textContent = label;

    const valueDiv = document.createElement("div");
    valueDiv.className = "misc-value";
    valueDiv.textContent = value;

    row.appendChild(labelDiv);
    row.appendChild(valueDiv);

    DOM.miscContainer.appendChild(row);
  });

  container.appendChild(fragment);
}

function renderPrerequisites(state) {
  if (!DOM.prereqContainer) return;

  DOM.prereqContainer.innerHTML = "";

  const prereqs = state.prerequisites;

  const fragment = document.createDocumentFragment();

  function createGroupRow(label, modules, requirements) {
    const row = document.createElement("div");

    row.className = "stat-row text-block-row";

    row.innerHTML = `
      <div class="prereq-group">
        <div class="prereq-used-by">
          ${modules.join(", ")}
        </div>

        <div class="prereq-requirements">
          <strong>${label}:</strong>
          ${requirements}
        </div>
      </div>
    `;

    fragment.appendChild(row);
  }

  // CHARACTERISTICS
  const characteristicEntries = Object.entries(prereqs.characteristics);

  if (characteristicEntries.length > 0) {
    const modules = [
      ...new Set(characteristicEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = characteristicEntries
      .map(([stat, data]) => `${stat} ${data.value}`)
      .join(", ");

    createGroupRow("Characteristics", modules, text);
  }

  // SKILLS
  const skillEntries = Object.entries(prereqs.skills);

  if (skillEntries.length > 0) {
    const modules = [
      ...new Set(skillEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = skillEntries
      .map(([skill, data]) => `${skill} ${data.value}`)
      .join(", ");

    createGroupRow("Skills", modules, text);
  }

  // TALENTS
  const talentEntries = Object.entries(prereqs.talents);

  if (talentEntries.length > 0) {
    const modules = [
      ...new Set(talentEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = talentEntries.map(([talent]) => talent).join(", ");

    createGroupRow("Talents", modules, text);
  }

  // FIELDS

  const fieldEntries = Object.entries(prereqs.fields);

  if (fieldEntries.length > 0) {
    const modules = [
      ...new Set(fieldEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = fieldEntries.map(([field]) => field).join(", ");

    createGroupRow("Fields", modules, text);
  }

  // CONDITIONAL

  const conditionalEntries = Object.values(prereqs.conditional);

  if (conditionalEntries.length > 0) {
    conditionalEntries.forEach((entry) => {
      let text = "";

      if (entry.type === "requiredAnyField") {
        text = `Requires one of: ${entry.fields.join(" or ")}`;
      }

      if (entry.type === "display" || entry.type === "override") {
        text = entry.display;
      }

      createGroupRow("Conditional", [entry.source], text);
    });
  }

  // FORBIDDEN
  const forbiddenEntries = Object.entries(prereqs.forbidden);

  if (forbiddenEntries.length > 0) {
    const modules = [
      ...new Set(forbiddenEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = forbiddenEntries.map(([item]) => item).join(", ");

    createGroupRow("Forbidden", modules, text);
  }

  // SPECIAL
  const specialEntries = Object.entries(prereqs.special);

  if (specialEntries.length > 0) {
    const modules = [
      ...new Set(specialEntries.flatMap(([, data]) => data.usedBy)),
    ];

    const text = specialEntries.map(([item]) => item).join(", ");

    createGroupRow("Special", modules, text);
  }

  if (!fragment.children.length) {
    DOM.prereqContainer.innerHTML =
      '<div class="no-data-notice">No prerequisites required.</div>';

    return;
  }

  DOM.prereqContainer.appendChild(fragment);
}

function renderXP(state) {
  if (DOM.xpGained) {
    DOM.xpGained.textContent = `${state.totalXpGained} XP`;
  }

  if (DOM.characterAge) {
    DOM.characterAge.textContent = `${state.finalCharacterAge.toFixed(1)} Years Old`;
  }

  if (DOM.xpBalance) {
    const balance = state.totalXpGained - state.totalXpSpent;

    DOM.xpBalance.textContent = `${balance} XP`;

    DOM.xpBalance.style.color = balance < 0 ? "#ef4444" : "#2563eb";
  }

  Object.entries(state.xpPools).forEach(([pool, value]) => {
    const element = document.getElementById(`pool-${pool}`);

    if (element) {
      element.textContent = `${value} XP`;
    }
  });
}

function renderRestrictedXpPools(state) {
  const container = document.getElementById("restricted-xp-container");

  if (!container) return;

  container.innerHTML = "";

  if (!state.restrictedXpPools.length) {
    container.innerHTML =
      '<div class="no-data-notice">No restricted XP pools.</div>';

    return;
  }

  state.restrictedXpPools.forEach((pool) => {
    const row = document.createElement("div");

    row.className = "restricted-xp-row";

    const fieldText =
      pool.requiredFields.length > 0
        ? pool.requiredFields.join(", ")
        : "No field restriction";

    const categoryText =
      pool.allowedCategories.length > 0
        ? pool.allowedCategories.join(", ")
        : "Any";

    row.innerHTML = `
      <div class="restricted-xp-header">
        <strong>${pool.totalXp} XP</strong>
      </div>

      <div class="restricted-xp-body">
        <div>
          Restricted:
          ${pool.restrictedXp} XP
        </div>

        <div>
          Unrestricted:
          ${pool.unrestrictedXp} XP
        </div>

        <div>
          Valid Fields:
          ${fieldText}
        </div>

        <div>
          Allowed Categories:
          ${categoryText}
        </div>

        ${
          pool.fallbackText
            ? `
          <div>
            Fallback:
            ${pool.fallbackText}
          </div>
        `
            : ""
        }
      </div>
    `;

    container.appendChild(row);
  });
}

function clearDynamicUI(slot) {
  const existing = slot.querySelector(".dynamic-ui-container");

  if (existing) {
    existing.remove();
  }
}

function createDynamicContainer(slot) {
  const container = document.createElement("div");

  container.className = "dynamic-ui-container";

  slot.appendChild(container);

  return container;
}

function renderSubFactionSelector(subFactions, container) {
  const wrapper = document.createElement("div");

  wrapper.className = "dynamic-block";

  const label = document.createElement("label");

  label.textContent = "Sub-Faction";

  const select = document.createElement("select");

  select.className = "dynamic-selector";

  select.innerHTML = '<option value="">Choose</option>';

  Object.entries(subFactions).forEach(([key, value]) => {
    const option = document.createElement("option");

    option.value = key;
    option.textContent = value.title;

    option.subDataRef = JSON.stringify(value);

    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    const selectedOption = select.options[select.selectedIndex];

    const existingNested = wrapper.querySelector(".nested-dynamic-container");

    if (existingNested) {
      existingNested.remove();
    }

    if (selectedOption?.subDataRef) {
      const data = JSON.parse(selectedOption.subDataRef);

      const nestedContainer = document.createElement("div");

      nestedContainer.className = "nested-dynamic-container";

      wrapper.appendChild(nestedContainer);

      if (data.choicePools) {
        renderChoicePools(data.choicePools, nestedContainer);
      }

      if (data.fixed) {
        renderFixedCustomPrompts(nestedContainer, data.fixed);
      }

      if (data.fields) {
        renderFieldSelections(nestedContainer, data);
      }

      if (data.languages) {
        renderLanguageSelectors(data.languages, nestedContainer);
      }

      if (data.subFactions) {
        renderSubFactionSelector(data.subFactions, nestedContainer);
      }

      if (data.skipRules) {
        renderSkipRules(data.skipRules, nestedContainer);
      }

      if (data.fixed?.choicePools) {
        renderChoicePools(data.fixed.choicePools, nestedContainer);
      }
    }

    cacheDOM();

    debouncedRecalc();
  });

  wrapper.appendChild(label);

  wrapper.appendChild(select);

  container.appendChild(wrapper);
}

function rebuildAllowedAdultLives() {
  const merged = {};

  Object.values(characterState.activeSkipSources).forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      merged[key] = value;
    });
  });

  characterState.allowedAdultLives = merged;
}

function renderChoicePools(choicePools, container, isRepeat = false) {
  const categories = [
    "characteristicChoices",
    "skillChoices",
    "talentChoices",
    "pairedTalentChoices",
    "aptitudeChoices",
    "weaponTrainingChoices",
    "professionAptitudeChoices",
    "rolePerkChoices",
  ];
  categories.forEach((category) => {
    // REPEATED MODULES DO NOT GET CHARACTERISTIC CHOICES
    if (isRepeat && category === "characteristicChoices") {
      return;
    }
    if (!choicePools[category]) return;

    choicePools[category].forEach((choiceSet, index) => {
      const wrapper = document.createElement("div");

      const choiceCount = parseInt(choiceSet.choices || 1, 10);

      wrapper.className = "dynamic-block";

      const label = document.createElement("label");

      label.textContent = choiceSet.label || `${category} ${index + 1}`;

      wrapper.appendChild(label);

      for (let i = 0; i < choiceCount; i++) {
        const singleOption =
          choiceSet.options?.length === 1 ? choiceSet.options[0] : null;

        const shouldUseDirectInput =
          choiceSet.requiresCustomPrompt && singleOption;

        // DIRECT TEXT INPUT MODE
        if (shouldUseDirectInput) {
          const customInput = document.createElement("input");

          customInput.type = "text";

          customInput.className = `custom-choice-input choice-custom-prompt-${i}`;

          customInput.dataset.choiceType = category;

          customInput.dataset.amount = choiceSet.amount || 0;

          // SKILLS
          if (category === "skillChoices") {
            customInput.dataset.baseSkill = singleOption;

            customInput.placeholder = `Choose a ${singleOption} to get ${choiceSet.amount} XP`;
          }

          // TALENTS
          if (category === "talentChoices") {
            customInput.dataset.baseTalent = singleOption;

            customInput.placeholder = `Choose a ${singleOption}`;
          }

          customInput.addEventListener("input", debouncedRecalc);

          wrapper.appendChild(customInput);

          continue;
        }

        // NORMAL DROPDOWN MODE
        const select = document.createElement("select");

        select.className = "dynamic-selector";

        select.dataset.choiceId = `${category}-${index}-${i}`;

        select.dataset.choiceType = category;

        select.dataset.requiresCustomPrompt =
          choiceSet.requiresCustomPrompt === true ? "true" : "false";

        let adjustedAmount = choiceSet.amount || 0;

        if (isRepeat && category === "skillChoices") {
          adjustedAmount = Math.floor(adjustedAmount / 2);
        }

        select.dataset.amount = adjustedAmount;

        select.innerHTML = '<option value="">Choose</option>';

        let resolvedOptions = choiceSet.options || [];

        resolvedOptions.forEach((optionData) => {
          // ==========================================
          // LANGUAGE EXPANSION LOGIC
          // ==========================================

          let expandedOptions = [];

          if (category === "skillChoices" && choiceSet.label === "Language") {
            const normalized =
              typeof optionData === "string" ? optionData.toLowerCase() : "";

            // PRIMARY = selected primary language(s)
            if (normalized === "primary") {
              expandedOptions = [...(characterState.languages?.primary || [])];
            }

            // SECONDARY = ALL available secondary language options
            else if (normalized === "secondary") {
              expandedOptions = [
                ...(characterState.availableLanguages?.secondary || []),
              ];
            }

            // NORMAL LANGUAGE OPTION
            else {
              expandedOptions = [optionData];
            }
          } else {
            expandedOptions = [optionData];
          }

          // ==========================================
          // RENDER EXPANDED OPTIONS
          // ==========================================

          expandedOptions.forEach((expandedOption) => {
            const option = document.createElement("option");

            // SIMPLE STRING FORMAT
            if (typeof expandedOption === "string") {
              option.value = expandedOption;
              option.textContent = expandedOption;

              // when secondary language is Any, provide custom input support

              if (
                category === "skillChoices" &&
                choiceSet.label === "Language" &&
                expandedOption.toLowerCase() === "any"
              ) {
                option.dataset.requiresCustomPrompt = "true";

                option.dataset.baseSkill = "Language";
              }
            }

            // PAIRED TALENT CHOICES
            else if (category === "pairedTalentChoices") {
              option.value = expandedOption.label || "";

              option.textContent = expandedOption.label || "";

              if (expandedOption.positive) {
                option.dataset.positiveTalent =
                  expandedOption.positive.talent || "";

                option.dataset.positiveAmount =
                  expandedOption.positive.amount || 0;
              }

              if (expandedOption.negative) {
                option.dataset.negativeTalent =
                  expandedOption.negative.talent || "";

                option.dataset.negativeAmount =
                  expandedOption.negative.amount || 0;
              }
            }

            // NORMAL OBJECT FORMAT
            else {
              option.value = expandedOption.skill || expandedOption.label;

              option.textContent = expandedOption.label || expandedOption.skill;

              option.dataset.requiresCustomPrompt =
                expandedOption.requiresCustomPrompt === true ? "true" : "false";

              option.dataset.baseSkill = expandedOption.skill || "";
            }

            select.appendChild(option);
          });
        });

        select.addEventListener("change", () => {
          const existingPrompt = wrapper.querySelector(
            `.choice-custom-prompt-${i}`,
          );

          if (existingPrompt) {
            existingPrompt.remove();
          }

          const selectedOption = select.options[select.selectedIndex];

          const requiresCustom =
            selectedOption.dataset.requiresCustomPrompt === "true";

          if (requiresCustom && select.value) {
            const customInput = document.createElement("input");

            customInput.type = "text";

            customInput.className = `custom-choice-input choice-custom-prompt-${i}`;

            customInput.dataset.choiceType = category;

            customInput.dataset.amount = choiceSet.amount || 0;

            // custom skills
            if (category === "skillChoices") {
              customInput.dataset.baseSkill =
                selectedOption.dataset.baseSkill || select.value;

              customInput.dataset.parentSelectId = select.dataset.choiceId;

              customInput.placeholder = `Enter ${selectedOption.textContent} Specialization`;
            }

            // custom talents
            if (category === "talentChoices") {
              customInput.dataset.baseTalent = select.value;

              customInput.placeholder = `Enter ${select.value}`;
            }

            customInput.addEventListener("input", debouncedRecalc);

            wrapper.appendChild(customInput);
          }

          cacheDOM();

          debouncedRecalc();
        });

        wrapper.appendChild(select);
      }

      container.appendChild(wrapper);
    });
  });
}

function renderFixedCustomPrompts(container, fixedData) {
  // SKILLS
  if (fixedData.skills) {
    Object.entries(fixedData.skills).forEach(([skillKey, skillObj]) => {
      const resolved = resolveSkillDefinition(skillKey, skillObj);

      if (!resolved.requiresCustomPrompt) {
        return;
      }

      const wrapper = document.createElement("div");

      wrapper.className = "dynamic-block";

      const input = document.createElement("input");

      input.type = "text";

      input.className = "custom-choice-input";

      input.dataset.baseSkill = resolved.skillName;

      input.dataset.amount = resolved.amount;

      input.placeholder = `Choose a ${resolved.label} to get ${resolved.amount} XP`;

      input.addEventListener("input", debouncedRecalc);

      wrapper.appendChild(input);

      container.appendChild(wrapper);
    });
  }

  // TALENTS
  if (fixedData.talents) {
    Object.entries(fixedData.talents).forEach(([talentKey, talentObj]) => {
      if (!talentObj.requiresCustomPrompt) {
        return;
      }

      const wrapper = document.createElement("div");

      wrapper.className = "dynamic-block";

      const input = document.createElement("input");

      input.type = "text";

      input.className = "custom-choice-input";

      input.dataset.baseTalent = talentKey;

      input.dataset.amount = talentObj.amount || 0;

      input.placeholder = `Choose a ${talentKey}`;

      input.addEventListener("input", debouncedRecalc);

      wrapper.appendChild(input);

      container.appendChild(wrapper);
    });
  }
}

function renderSingleSelectedModule(stageKey, slot, moduleInfo) {
  const chipContainer = slot.querySelector(".selected-module-container");

  const moduleCard = document.createElement("div");

  moduleCard.className = "selected-module-card";
  moduleCard.dataset.moduleKey = moduleInfo.key;

  const header = document.createElement("div");

  header.className = "selected-module-header";

  const title = document.createElement("div");

  title.className = "selected-module-title";
  title.textContent = moduleInfo.isRepeat
    ? `${moduleInfo.title} (Repeat)`
    : moduleInfo.title;

  const removeButton = document.createElement("button");

  removeButton.type = "button";
  removeButton.className = "remove-module-button";
  removeButton.textContent = "✕";

  removeButton.addEventListener("click", () => {
    characterState.selectedStageModules[stageKey] =
      characterState.selectedStageModules[stageKey].filter(
        (entry) => entry.instanceId !== moduleInfo.instanceId,
      );

    moduleCard.remove();

    const chip = chipContainer.querySelector(
      `[data-chip-key="${moduleInfo.key}"]`,
    );

    if (chip) {
      chip.remove();
    }

    cacheDOM();
    debouncedRecalc();
  });

  header.appendChild(title);
  header.appendChild(removeButton);

  moduleCard.appendChild(header);

  const body = document.createElement("div");

  body.className = "selected-module-body";

  moduleCard.appendChild(body);

  slot.appendChild(moduleCard);

  renderDynamicModuleUI(
    stageKey,
    moduleInfo.data,
    body,
    moduleInfo.isRepeat || false,
  );

  // CHIP
  const chip = document.createElement("div");

  chip.className = "selected-module-chip";
  chip.dataset.chipKey = moduleInfo.key;
  chip.textContent = moduleInfo.title;

  chipContainer.appendChild(chip);

  cacheDOM();
}

function renderLanguageSelectors(languages, container) {
  characterState.availableLanguages.secondary = languages.secondary || [];

  const wrapper = document.createElement("div");

  wrapper.className = "dynamic-block language-block";

  function createLanguageControl(type, options = []) {
    const section = document.createElement("div");

    section.className = "language-section";

    const label = document.createElement("label");

    label.textContent =
      type.charAt(0).toUpperCase() + type.slice(1) + " Language";

    const select = document.createElement("select");

    select.className = "dynamic-selector language-selector";

    select.dataset.languageType = type;

    select.innerHTML = '<option value="">Choose</option>';

    options.forEach((language) => {
      const option = document.createElement("option");

      option.value = language;
      option.textContent = language;

      select.appendChild(option);
    });

    const customInput = document.createElement("input");

    customInput.type = "text";

    customInput.className = "language-custom-input";

    customInput.placeholder = `Enter ${label.textContent}`;

    customInput.style.display = "none";

    select.addEventListener("change", () => {
      customInput.style.display = select.value === "Any" ? "block" : "none";

      // RECALCULATE FIRST
      calculateTotalStats();

      // REBUILD ALL STAGE 5/6 MODULE UI
      rebuildDynamicLanguageDependentUI();

      cacheDOM();

      debouncedRecalc();
    });

    customInput.addEventListener("input", debouncedRecalc);

    section.appendChild(label);
    section.appendChild(select);
    section.appendChild(customInput);

    wrapper.appendChild(section);
  }

  createLanguageControl("primary", languages.primary || []);

  createLanguageControl("secondary", languages.secondary || []);

  container.appendChild(wrapper);
}

function renderSkipRules(skipRules, container) {
  if (!skipRules?.skipsStageFour) return;

  const wrapper = document.createElement("div");

  wrapper.className = "dynamic-block skip-rules-block";

  const label = document.createElement("label");

  const checkbox = document.createElement("input");

  checkbox.type = "checkbox";

  checkbox.className = "skip-stage-four-checkbox";

  label.appendChild(checkbox);

  label.append(" Substitute Stage Four");

  wrapper.appendChild(label);

  const validList = document.createElement("div");

  validList.className = "skip-valid-lives";

  Object.entries(skipRules.allowedAdultLives || {}).forEach(
    ([lifeKey, data]) => {
      const row = document.createElement("div");

      row.textContent = `${lifeKey} (Age ${data.ageOnSkip})`;

      validList.appendChild(row);
    },
  );

  wrapper.appendChild(validList);

  checkbox.addEventListener("change", () => {
    characterState.skipStageFour = checkbox.checked;

    const sourceKey =
      container.closest(".selected-module-card")?.dataset.moduleKey ||
      container.closest(".slot")?.dataset.stage;

    if (checkbox.checked) {
      characterState.activeSkipSources[sourceKey] = skipRules.allowedAdultLives;
    } else {
      delete characterState.activeSkipSources[sourceKey];
    }

    rebuildAllowedAdultLives();

    applyStageFourSkip();

    debouncedRecalc();
  });

  container.appendChild(wrapper);
}

function renderFieldSelections(container, moduleData) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-selection-wrapper";

  const fields = moduleData.fields;

  // REQUIRED BASIC FIELD
  if (fields.basic) {
    wrapper.appendChild(
      createFieldDropdown("Basic Field", fields.basic.options),
    );
  }

  // REQUIRED ADVANCED FIELD
  if (fields.advanced) {
    wrapper.appendChild(
      createFieldDropdown("Advanced Field", fields.advanced.options),
    );
  }

  // OPTIONAL EXTRA FIELD
  const optionalOptions = [];

  if (fields.advanced?.options) {
    optionalOptions.push(...fields.advanced.options);
  }

  if (fields.special?.options) {
    optionalOptions.push(...fields.special.options);
  }

  if (optionalOptions.length > 0) {
    wrapper.appendChild(
      createFieldDropdown(
        "Optional Advanced/Special Field",
        optionalOptions,
        true,
      ),
    );
  }

  wrapper.querySelectorAll("select").forEach((selectElement) => {
    selectElement.addEventListener("change", () => {
      const existingPrompts = wrapper.querySelectorAll(".field-any-prompt");

      existingPrompts.forEach((prompt) => prompt.remove());

      const selects = wrapper.querySelectorAll("select");

      selects.forEach((select) => {
        const selectedField = select.value;

        if (!selectedField) return;

        const repository = characterDataGlobal.stageFive.fieldsRepository;

        const fieldKey = Object.keys(repository).find(
          (key) => repository[key].title === selectedField,
        );

        if (!fieldKey) return;

        renderFieldAnyPrompts(wrapper, repository[fieldKey]);
      });

      cacheDOM();

      debouncedRecalc();
    });
  });

  container.appendChild(wrapper);
}

function createFieldDropdown(labelText, options, optional = false) {
  const container = document.createElement("div");
  container.className = "field-dropdown-container";

  const label = document.createElement("label");
  label.textContent = labelText;

  const select = document.createElement("select");

  select.className = "field-selector dynamic-selector";

  select.addEventListener("change", () => {
    debouncedRecalc();
  });

  const defaultOption = document.createElement("option");

  defaultOption.value = "";

  defaultOption.textContent = optional ? "-- Optional --" : "-- Select --";

  select.appendChild(defaultOption);

  options.forEach((option) => {
    const opt = document.createElement("option");

    opt.value = option;
    opt.textContent = option;

    select.appendChild(opt);
  });

  container.appendChild(label);
  container.appendChild(select);

  return container;
}

function renderFieldAnyPrompts(container, fieldData) {
  if (!fieldData?.skills) return;

  fieldData.skills.forEach((skill, index) => {
    if (!skill.name?.toLowerCase().includes("/any")) return;

    const wrapper = document.createElement("div");

    wrapper.className = "dynamic-block field-any-prompt";

    const label = document.createElement("label");

    const baseSkill = skill.name.split("/")[0];

    label.textContent = `${baseSkill} Specialization`;

    const input = document.createElement("input");

    input.type = "text";

    input.className = "field-any-input";

    input.dataset.baseSkill = baseSkill;

    input.dataset.amount = skill.amount || 0;

    input.dataset.fieldIndex = index;

    input.placeholder = `Enter ${baseSkill}`;

    input.addEventListener("input", debouncedRecalc);

    wrapper.appendChild(label);

    wrapper.appendChild(input);

    container.appendChild(wrapper);
  });
}

function applyStageFourSkip() {
  const stageFourSlot = document.querySelector('[data-stage="stageFour"]');

  if (!stageFourSlot) return;

  const select = stageFourSlot.querySelector(".stage-selector");

  const title = stageFourSlot.querySelector(".slot-title");

  if (!select || !title) return;

  select.innerHTML = '<option value="">Choose</option>';

  // SKIP ENABLED
  if (
    characterState.skipStageFour &&
    Object.keys(characterState.allowedAdultLives).length > 0
  ) {
    title.textContent = "Stage 4: Adult Life";

    Object.entries(characterState.allowedAdultLives).forEach(
      ([lifeKey, data]) => {
        let moduleData = characterDataGlobal.stageFive.modules?.[lifeKey];

        if (!moduleData) {
          moduleData = characterDataGlobal.stageSix.modules?.[lifeKey];
        }

        if (!moduleData) return;

        const option = document.createElement("option");

        option.value = lifeKey;

        option.textContent = moduleData.title;

        option.subDataRef = JSON.stringify(moduleData);

        option.dataset.skipAge = data.ageOnSkip;

        select.appendChild(option);
      },
    );
  }

  // NORMAL STAGE FOUR
  else {
    title.textContent = `Stage 4: ${characterDataGlobal.stageFour.title}`;

    Object.entries(characterDataGlobal.stageFour.modules).forEach(
      ([key, value]) => {
        const option = document.createElement("option");

        option.value = key;

        option.textContent = value.title;

        option.subDataRef = JSON.stringify(value);

        select.appendChild(option);
      },
    );
  }

  clearDynamicUI(stageFourSlot);

  cacheDOM();
}

function renderDynamicModuleUI(stageKey, moduleData, slot, isRepeat = false) {
  const container = createDynamicContainer(slot);

  if (moduleData.subFactions) {
    renderSubFactionSelector(moduleData.subFactions, container);
  }
  if (moduleData.languages) {
    renderLanguageSelectors(moduleData.languages, container);
  }
  if (moduleData.skipRules) {
    renderSkipRules(moduleData.skipRules, container);
  }
  if (moduleData.choicePools) {
    renderChoicePools(moduleData.choicePools, container, isRepeat);
  }
  if (moduleData.fixed) {
    renderFixedCustomPrompts(container, moduleData.fixed);
  }
  if (moduleData.fields) {
    renderFieldSelections(container, moduleData);
  }

  if (moduleData.fixed?.choicePools) {
    renderChoicePools(moduleData.fixed.choicePools, container, isRepeat);
  }

  cacheDOM();
}

function rebuildDynamicLanguageDependentUI() {
  ["stageFive", "stageSix"].forEach((stageKey) => {
    const modules = characterState.selectedStageModules[stageKey] || [];

    modules.forEach((moduleInfo) => {
      const card = document.querySelector(
        `[data-module-key="${moduleInfo.key}"]`,
      );

      if (!card) return;

      const body = card.querySelector(".selected-module-body");

      if (!body) return;

      // CLEAR OLD UI
      body.innerHTML = "";

      // RE-RENDER
      renderDynamicModuleUI(
        stageKey,
        moduleInfo.data,
        body,
        moduleInfo.isRepeat || false,
      );
    });
  });
}

function renderAll(state) {
  renderCharacteristics(state);
  renderSkills(state);
  renderTalents(state);
  renderMiscellaneous(state);
  renderPrerequisites(state);
  renderXP(state);
  renderRestrictedXpPools(state);
}

function calculateTotalStats() {
  const state = createBaseState();

  processSelections(state);

  processCustomInputs(state);

  // STORE CURRENT STATE GLOBALLY
  characterState.currentCalculatedState = state;

  renderAll(state);
}

function populateStage(stageKey, stageData) {
  const slot = document.querySelector(`[data-stage="${stageKey}"]`);

  if (!slot) return;

  const select = slot.querySelector(".stage-selector");

  const title = slot.querySelector(".slot-title");

  if (!select || !title) return;

  title.textContent = `Stage ${stageData.stageNumber}: ${stageData.title}`;

  select.innerHTML = '<option value="">Choose</option>';

  let moduleChipContainer = null;

  if (stageKey === "stageFive" || stageKey === "stageSix") {
    moduleChipContainer = document.createElement("div");

    moduleChipContainer.className = "selected-module-container";

    slot.appendChild(moduleChipContainer);

    const clearButton = document.createElement("button");

    clearButton.type = "button";

    clearButton.textContent = "Clear Selections";

    clearButton.className = "clear-stage-button";

    clearButton.addEventListener("click", () => {
      // CLEAR STATE
      characterState.selectedStageModules[stageKey] = [];

      // CLEAR SELECTED OPTIONS
      Array.from(select.options).forEach((option) => {
        option.selected = false;
      });

      // REMOVE ALL MODULE CARDS
      const existingCards = slot.querySelectorAll(".selected-module-card");

      existingCards.forEach((card) => card.remove());

      // CLEAR CHIPS
      const chipContainer = slot.querySelector(".selected-module-container");

      if (chipContainer) {
        chipContainer.innerHTML = "";
      }

      clearDynamicUI(slot);

      cacheDOM();
      debouncedRecalc();
    });
    slot.appendChild(clearButton);
  }

  Object.entries(stageData.modules || {}).forEach(([key, value]) => {
    const option = document.createElement("option");

    option.value = key;
    option.textContent = value.title;

    option.subDataRef = JSON.stringify(value);

    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    updateTitle(select, title.id);

    const selectedOption = select.options[select.selectedIndex];

    // STAGE 5 & 6 MULTI-SELECT LOGIC
    if (stageKey === "stageFive" || stageKey === "stageSix") {
      if (stageKey === "stageSix") {
        const existingCount = characterState.selectedStageModules[
          stageKey
        ].filter((entry) => entry.key === selectedOption.value).length;

        characterState.selectedStageModules[stageKey].push({
          instanceId: ++stageSixInstanceCounter,
          key: selectedOption.value,
          title: selectedOption.textContent,
          data: JSON.parse(selectedOption.subDataRef),

          // FIRST = ORIGINAL
          // SECOND+ = REPEAT
          isRepeat: existingCount > 0,
        });
      } else {
        const alreadyExists = characterState.selectedStageModules[
          stageKey
        ].some((entry) => entry.key === selectedOption.value);

        if (!alreadyExists) {
          characterState.selectedStageModules[stageKey].push({
            key: selectedOption.value,
            title: selectedOption.textContent,
            data: JSON.parse(selectedOption.subDataRef),
          });
        }
      }

      select.value = "";

      renderSingleSelectedModule(
        stageKey,
        slot,
        characterState.selectedStageModules[stageKey].slice(-1)[0],
      );

      cacheDOM();

      debouncedRecalc();

      return;
    }

    // NORMAL SINGLE-SELECTION STAGES
    clearDynamicUI(slot);

    if (selectedOption?.subDataRef) {
      const data = JSON.parse(selectedOption.subDataRef);

      renderDynamicModuleUI(stageKey, data, slot);
    }

    cacheDOM();
    debouncedRecalc();
  });
}

async function initializeApplication() {
  cacheDOM();

  const response = await fetch("data.json");

  characterDataGlobal = await response.json();

  STAGES.forEach((stageKey) => {
    if (characterDataGlobal[stageKey]) {
      populateStage(stageKey, characterDataGlobal[stageKey]);
    }
  });

  calculateTotalStats();
}

document.addEventListener("DOMContentLoaded", initializeApplication);
