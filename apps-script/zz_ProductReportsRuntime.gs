/**
 * PRODUCT REPORTS V3 RUNTIME
 * Keep this file after ProductReports.gs in the Apps Script project.
 * It guarantees the new report engine is used and corrects demand timelines
 * by including zero-sales weeks between the first activity date and today.
 */

getOperationalReports = function(payload) {
  return buildProductReportsV3_(payload || {});
};

function weeklyProductTimelineV3_(sales, purchases) {
  const map = {};
  const allDates = [];

  (sales || []).forEach((row) => {
    if (!row.date) return;
    allDates.push(row.date);
    const key = productWeekKeyV3_(row.date);
    if (!map[key]) map[key] = emptyProductWeekV3_(row.date);
    map[key].sales_lb += productNumber_(row.pounds);
    map[key].revenue += productNumber_(row.revenue);
  });

  (purchases || []).forEach((row) => {
    if (!row.date) return;
    allDates.push(row.date);
    const key = productWeekKeyV3_(row.date);
    if (!map[key]) map[key] = emptyProductWeekV3_(row.date);
    map[key].purchase_lb += productNumber_(row.pounds);
    map[key].purchase_spend += productNumber_(row.spend);
  });

  if (!allDates.length) return [];

  let cursor = productWeekStartV3_(new Date(Math.min.apply(null, allDates.map((date) => date.getTime()))));
  const currentWeek = productWeekStartV3_(new Date());
  while (cursor <= currentWeek) {
    const key = productWeekKeyV3_(cursor);
    if (!map[key]) map[key] = emptyProductWeekV3_(cursor);
    cursor = new Date(cursor.getTime() + 7 * 86400000);
  }

  const rows = Object.keys(map).map((key) => map[key]).sort((a, b) => a.date - b.date);
  rows.forEach((row, index) => {
    const slice = rows.slice(Math.max(0, index - 3), index + 1);
    row.moving_average_4w = productAverage_(slice.map((item) => item.sales_lb));
  });
  return rows;
}

function emptyProductWeekV3_(value) {
  return {
    date: productWeekStartV3_(value),
    sales_lb: 0,
    purchase_lb: 0,
    revenue: 0,
    purchase_spend: 0,
    moving_average_4w: 0
  };
}

function recencyWeightedWeeklyDemandV3_(weekly) {
  const now = new Date();
  const periods = [
    { min: 0, max: 7, weight: 0.40 },
    { min: 8, max: 30, weight: 0.30 },
    { min: 31, max: 60, weight: 0.20 },
    { min: 61, max: 120, weight: 0.10 }
  ];

  const available = periods.map((period) => {
    const matches = (weekly || []).filter((row) => {
      const days = Math.floor((now - row.date) / 86400000);
      return days >= period.min && days <= period.max;
    });
    return {
      weight: period.weight,
      value: matches.length ? productAverage_(matches.map((row) => row.sales_lb)) : null
    };
  }).filter((period) => period.value !== null);

  const availableWeight = available.reduce((sum, period) => sum + period.weight, 0);
  return availableWeight > 0
    ? available.reduce((sum, period) => sum + period.value * period.weight / availableWeight, 0)
    : 0;
}
