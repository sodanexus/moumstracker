/* Moteur pur du plan patrimonial privé : aucun DOM, aucun accès Supabase. */
(function exposePrivatePlanCore(root) {
  'use strict';

  const TYPES = Object.freeze(['HOUSE', 'PEA', 'CTO', 'PEE', 'PER', 'AV', 'Crypto', 'Livret', 'Immo', 'Autre']);
  const DEFAULT_ASSUMPTIONS = Object.freeze({
    CASH:   { rate: 2, spread: 1 },
    PEA:    { rate: 7, spread: 4 },
    CTO:    { rate: 7, spread: 4 },
    PEE:    { rate: 5, spread: 3 },
    PER:    { rate: 5, spread: 3 },
    AV:     { rate: 3, spread: 1.5 },
    Crypto: { rate: 8, spread: 10 },
    Livret: { rate: 2, spread: 1 },
    Immo:   { rate: 3, spread: 2 },
    Autre:  { rate: 0, spread: 1 },
    PROPERTY: { rate: 1, spread: 1 },
  });

  function finite(value, fallback = 0, min = -Infinity, max = Infinity) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function cleanMonth(value) {
    const match = String(value || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    return match ? match[0] : '';
  }

  function monthIndex(value) {
    const month = cleanMonth(value);
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    return year * 12 + number - 1;
  }

  function monthFromIndex(index) {
    const safe = Math.max(0, Math.floor(index));
    const year = Math.floor(safe / 12);
    const month = safe % 12 + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function currentMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthlyPayment(principal, annualRatePct, durationYears) {
    const amount = finite(principal, 0, 0);
    const months = Math.max(1, Math.round(finite(durationYears, 1, 1, 60) * 12));
    const monthlyRate = finite(annualRatePct, 0, 0, 100) / 1200;
    if (!amount) return 0;
    if (!monthlyRate) return amount / months;
    return amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
  }

  function normalizeAssumptions(raw) {
    const assumptions = {};
    for (const [type, defaults] of Object.entries(DEFAULT_ASSUMPTIONS)) {
      const source = raw?.[type] || {};
      assumptions[type] = {
        rate: finite(source.rate, defaults.rate, -95, 100),
        spread: finite(source.spread, defaults.spread, 0, 100),
      };
    }
    return assumptions;
  }

  function normalizeContributions(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 30).map((item, index) => {
      const type = TYPES.includes(item?.type) ? item.type : 'Autre';
      return {
        id: String(item?.id || `flow-${index + 1}`).slice(0, 80),
        label: String(item?.label || type).trim().slice(0, 80) || type,
        type,
        before: finite(item?.before, 0, 0, 100000),
        after: finite(item?.after, 0, 0, 100000),
        startMonth: cleanMonth(item?.startMonth),
        endMonth: cleanMonth(item?.endMonth),
      };
    });
  }

  function normalizePlan(raw) {
    const plan = raw && typeof raw === 'object' ? raw : {};
    const profile = plan.profile || {};
    const household = plan.household || {};
    const house = plan.house || {};
    const projection = plan.projection || {};
    return {
      version: 1,
      profile: {
        age: finite(profile.age, 0, 0, 120),
        personalIncomeAnnual: finite(profile.personalIncomeAnnual, 0, 0),
        partnerIncomeAnnual: finite(profile.partnerIncomeAnnual, 0, 0),
        partnerBonusAnnual: finite(profile.partnerBonusAnnual, 0, 0),
        currentHousingMonthly: finite(profile.currentHousingMonthly, 0, 0),
      },
      household: {
        partnerLiquid: finite(household.partnerLiquid, 0, 0),
        partnerPea: finite(household.partnerPea, 0, 0),
        reserveMinimum: finite(household.reserveMinimum, 0, 0),
        inheritanceEnabled: Boolean(household.inheritanceEnabled),
        inheritanceAmount: finite(household.inheritanceAmount, 0, 0),
        inheritanceAfterYears: finite(household.inheritanceAfterYears, 0, 0, 80),
      },
      house: {
        price: finite(house.price, 0, 0),
        notaryFees: finite(house.notaryFees, 0, 0),
        guaranteeFees: finite(house.guaranteeFees, 0, 0),
        brokerageFees: finite(house.brokerageFees, 0, 0),
        applicationFees: finite(house.applicationFees, 0, 0),
        targetDownPayment: finite(house.targetDownPayment, 0, 0),
        personalTarget: finite(house.personalTarget, 0, 0),
        personalFund: finite(house.personalFund, 0, 0),
        loanAmount: finite(house.loanAmount, 0, 0),
        annualRate: finite(house.annualRate, 0, 0, 100),
        durationYears: finite(house.durationYears, 25, 1, 60),
        insuranceMonthly: finite(house.insuranceMonthly, 0, 0),
        propertyTaxMonthly: finite(house.propertyTaxMonthly, 0, 0),
        maintenanceMonthly: finite(house.maintenanceMonthly, 0, 0),
        earliestPurchaseMonth: cleanMonth(house.earliestPurchaseMonth),
      },
      projection: {
        horizonYears: Math.round(finite(projection.horizonYears, 20, 1, 60)),
        inflationRate: finite(projection.inflationRate, 2, 0, 20),
      },
      assumptions: normalizeAssumptions(plan.assumptions),
      contributions: normalizeContributions(plan.contributions),
    };
  }

  function annualRate(plan, type, scenario) {
    const assumption = plan.assumptions[type] || DEFAULT_ASSUMPTIONS[type] || DEFAULT_ASSUMPTIONS.Autre;
    const direction = scenario === 'pess' ? -1 : scenario === 'opti' ? 1 : 0;
    return Math.max(-95, Math.min(100, assumption.rate + direction * assumption.spread));
  }

  function monthlyRate(annualPct) {
    return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  }

  function activeFlow(flow, month) {
    const index = monthIndex(month);
    const start = monthIndex(flow.startMonth);
    const end = monthIndex(flow.endMonth);
    return (start === null || index >= start) && (end === null || index <= end);
  }

  function simulate(input) {
    const plan = normalizePlan(input?.plan);
    const scenario = ['pess', 'real', 'opti'].includes(input?.scenario) ? input.scenario : 'real';
    const startMonth = cleanMonth(input?.startMonth) || currentMonth(input?.startDate || new Date());
    const startIndex = monthIndex(startMonth);
    const buckets = Array.isArray(input?.buckets) ? input.buckets : [];
    const balances = new Map();
    let personalTotal = 0;
    let personalLiquid = 0;

    for (const bucket of buckets) {
      const type = TYPES.includes(bucket?.type) ? bucket.type : 'Autre';
      const value = finite(bucket?.value, 0, 0);
      personalTotal += value;
      if (type === 'Livret') personalLiquid += value;
      else balances.set(type, (balances.get(type) || 0) + value);
    }
    balances.set('PEA', (balances.get('PEA') || 0) + plan.household.partnerPea);

    let cash = personalLiquid + plan.household.partnerLiquid;
    let personalFund = Math.min(plan.house.personalFund, cash);
    let propertyValue = 0;
    let mortgageBalance = 0;
    let purchaseMonth = '';
    let personalTargetMonth = personalFund >= plan.house.personalTarget && plan.house.personalTarget > 0 ? startMonth : '';
    let inheritanceApplied = false;
    const payment = monthlyPayment(plan.house.loanAmount, plan.house.annualRate, plan.house.durationYears);
    const horizonMonths = plan.projection.horizonYears * 12;
    const records = [];

    const snapshot = (offset, month) => {
      const investedAssets = [...balances.values()].reduce((sum, value) => sum + value, 0);
      const financialAssets = investedAssets + cash;
      const propertyEquity = propertyValue - mortgageBalance;
      return {
        month,
        offset,
        year: offset / 12,
        financialAssets,
        propertyValue,
        mortgageBalance,
        propertyEquity,
        netWorth: financialAssets + propertyEquity,
        cash,
      };
    };

    records.push(snapshot(0, startMonth));
    const earliestPurchase = monthIndex(plan.house.earliestPurchaseMonth);
    const downPayment = plan.house.targetDownPayment;

    for (let offset = 1; offset <= horizonMonths; offset++) {
      const month = monthFromIndex(startIndex + offset);
      const purchased = Boolean(purchaseMonth);

      for (const [type, value] of balances) {
        balances.set(type, value * (1 + monthlyRate(annualRate(plan, type, scenario))));
      }
      cash *= 1 + monthlyRate(annualRate(plan, 'CASH', scenario));

      if (purchased) {
        propertyValue *= 1 + monthlyRate(annualRate(plan, 'PROPERTY', scenario));
        if (mortgageBalance > 0) {
          const interest = mortgageBalance * (plan.house.annualRate / 1200);
          const principalPaid = Math.max(0, Math.min(mortgageBalance, payment - interest));
          mortgageBalance -= principalPaid;
        }
      }

      for (const flow of plan.contributions) {
        if (!activeFlow(flow, month)) continue;
        const amount = purchaseMonth ? flow.after : flow.before;
        if (!amount) continue;
        if (flow.type === 'HOUSE' || flow.type === 'Livret') {
          cash += amount;
          if (!purchaseMonth && flow.type === 'HOUSE') personalFund += amount;
        } else {
          balances.set(flow.type, (balances.get(flow.type) || 0) + amount);
        }
      }

      if (!personalTargetMonth && plan.house.personalTarget > 0 && personalFund >= plan.house.personalTarget) {
        personalTargetMonth = month;
      }

      const inheritanceOffset = Math.round(plan.household.inheritanceAfterYears * 12);
      if (plan.household.inheritanceEnabled && !inheritanceApplied && inheritanceOffset > 0 && offset >= inheritanceOffset) {
        cash += plan.household.inheritanceAmount;
        inheritanceApplied = true;
      }

      const purchaseAllowed = earliestPurchase === null || monthIndex(month) >= earliestPurchase;
      if (!purchaseMonth && purchaseAllowed && downPayment > 0 && cash - plan.household.reserveMinimum >= downPayment) {
        cash -= downPayment;
        purchaseMonth = month;
        propertyValue = plan.house.price;
        mortgageBalance = plan.house.loanAmount;
      }

      if (offset % 12 === 0 || offset === horizonMonths) records.push(snapshot(offset, month));
    }

    const final = records[records.length - 1];
    const inflationFactor = Math.pow(1 + plan.projection.inflationRate / 100, plan.projection.horizonYears);
    const monthlyBefore = plan.contributions.reduce((sum, flow) => sum + flow.before, 0);
    const monthlyAfter = plan.contributions.reduce((sum, flow) => sum + flow.after, 0);
    const projectFees = plan.house.notaryFees + plan.house.guaranteeFees + plan.house.brokerageFees + plan.house.applicationFees;
    const householdTotal = personalTotal + plan.household.partnerLiquid + plan.household.partnerPea;
    const mobilizableNow = Math.max(0, cashAtStart(personalLiquid, plan) - plan.household.reserveMinimum);

    return {
      plan,
      scenario,
      startMonth,
      records,
      final,
      finalRealNetWorth: final.netWorth / inflationFactor,
      finalRealFinancialAssets: final.financialAssets / inflationFactor,
      payment,
      purchaseMonth,
      personalTargetMonth,
      personalTotal,
      personalLiquid,
      householdTotal,
      householdLiquid: personalLiquid + plan.household.partnerLiquid,
      mobilizableNow,
      remainingDownPayment: Math.max(0, downPayment - mobilizableNow),
      monthlyBefore,
      monthlyAfter,
      projectFees,
      projectTotal: plan.house.price + projectFees,
      inheritanceApplied,
    };
  }

  function cashAtStart(personalLiquid, plan) {
    return personalLiquid + plan.household.partnerLiquid;
  }

  const api = Object.freeze({
    TYPES,
    DEFAULT_ASSUMPTIONS,
    normalizePlan,
    monthlyPayment,
    monthIndex,
    monthFromIndex,
    currentMonth,
    simulate,
  });
  root.MoumixPrivatePlanCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
