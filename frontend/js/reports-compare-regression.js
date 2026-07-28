import { getOperationalReports } from "./api-smooth1.js?v=product-dashboard1";

let cache = null;
let rendering = false;

const METRICS = [
  ["quantity_lb", "Sales volume", "lb"],
  ["selling_price_per_lb", "Selling price / lb", "money"],
  ["cost_per_lb", "Product cost / lb", "money"],
  ["profit_per_lb", "Profit / lb", "money"],
  ["estimated_margin_percent", "Gross margin", "percent"],
  ["revenue", "Revenue", "money"]
];

const MODELS = [
  ["auto", "Auto fit"],
  ["linear", "Linear"],
  ["quadratic", "Quadratic"],
  ["logarithmic", "Logarithmic"],
  ["exponential", "Exponential"]
];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

async function reportsData() {
  if (!cache) cache = await getOperationalReports();
  return cache;
}

function periodStart(value) {
  if (!value || value === "ALL") return null;
  const now = new Date();
  if (value === "YTD") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - Number(value) * 86400000);
}

function salesObservations(product, period) {
  const start = periodStart(period);
  return (product?.sales || [])
    .filter((row) => !start || new Date(row.date) >= start)
    .map((row) => {
      const qty = Number(row.quantity_lb);
      const price = Number(row.selling_price_per_lb);
      const revenue = Number(row.revenue);
      const estimatedCost = Number(row.estimated_cost);
      const margin = Number(row.estimated_margin_percent);
      const costPerLb = qty > 0 && Number.isFinite(estimatedCost) ? estimatedCost / qty : NaN;
      const profitPerLb = Number.isFinite(price) && Number.isFinite(costPerLb) ? price - costPerLb : NaN;
      return {
        date: row.date,
        customer: row.customer || "Customer",
        quantity_lb: qty,
        selling_price_per_lb: price,
        cost_per_lb: costPerLb,
        profit_per_lb: profitPerLb,
        estimated_margin_percent: margin,
        revenue
      };
    });
}

function selectOptions(rows, selected) {
  return rows.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function metricMeta(key) {
  const match = METRICS.find(([value]) => value === key);
  return match || [key, key, "number"];
}

function formatMetric(key, value) {
  const [, , type] = metricMeta(key);
  if (!Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (type === "money") return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "percent") return `${n.toFixed(1)}%`;
  if (type === "lb") return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function average(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }

function linearFit(xs, ys) {
  const meanX = average(xs), meanY = average(ys);
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (Math.abs(denominator) < 1e-12) return null;
  const b = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0) / denominator;
  return { a: meanY - b * meanX, b };
}

function solve3x3(matrix) {
  const rows = matrix.map((row) => row.slice());
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-12) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let cell = column; cell < 4; cell += 1) rows[column][cell] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let cell = column; cell < 4; cell += 1) rows[row][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map((row) => row[3]);
}

function quadraticFit(points) {
  const s = points.reduce((a, p) => { const x2=p.x*p.x; a.x+=p.x; a.x2+=x2; a.x3+=x2*p.x; a.x4+=x2*x2; a.y+=p.y; a.xy+=p.x*p.y; a.x2y+=x2*p.y; return a; }, {x:0,x2:0,x3:0,x4:0,y:0,xy:0,x2y:0});
  const solution = solve3x3([[points.length,s.x,s.x2,s.y],[s.x,s.x2,s.x3,s.xy],[s.x2,s.x3,s.x4,s.x2y]]);
  return solution ? { a: solution[0], b: solution[1], c: solution[2] } : null;
}

function rSquared(actual, predicted) {
  const mean = average(actual);
  const total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (Math.abs(total) < 1e-12) return 0;
  const residual = actual.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  return 1 - residual / total;
}

function coefficient(value) {
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.001)) return value.toExponential(2);
  return Number(value.toFixed(4)).toString();
}

function term(value, label) { return `${value >= 0 ? "+" : "−"} ${coefficient(Math.abs(value))}${label}`; }

function fitRegression(points, model) {
  if (points.length < 3) return null;
  let predict, equation, parameters, fit;
  if (model === "linear") {
    fit = linearFit(points.map(p=>p.x), points.map(p=>p.y)); if (!fit) return null;
    predict = x => fit.a + fit.b*x; equation = `y = ${coefficient(fit.a)} ${term(fit.b,"x")}`; parameters=2;
  } else if (model === "quadratic") {
    if (points.length < 4) return null;
    fit = quadraticFit(points); if (!fit) return null;
    predict = x => fit.a + fit.b*x + fit.c*x*x; equation = `y = ${coefficient(fit.a)} ${term(fit.b,"x")} ${term(fit.c,"x²")}`; parameters=3;
  } else if (model === "logarithmic") {
    const valid = points.filter(p=>p.x>0); if (valid.length<3) return null;
    fit = linearFit(valid.map(p=>Math.log(p.x)), valid.map(p=>p.y)); if (!fit) return null;
    predict = x => x>0 ? fit.a + fit.b*Math.log(x) : NaN; equation = `y = ${coefficient(fit.a)} ${term(fit.b,"ln(x)")}`; parameters=2;
  } else if (model === "exponential") {
    const valid = points.filter(p=>p.y>0); if (valid.length<3) return null;
    fit = linearFit(valid.map(p=>p.x), valid.map(p=>Math.log(p.y))); if (!fit) return null;
    const a=Math.exp(fit.a); predict=x=>a*Math.exp(fit.b*x); equation=`y = ${coefficient(a)} · e^(${coefficient(fit.b)}x)`; parameters=2;
  } else return null;
  const predictions=points.map(p=>predict(p.x)); if (predictions.some(v=>!Number.isFinite(v))) return null;
  const r2=rSquared(points.map(p=>p.y),predictions), n=points.length;
  const adjustedR2=n>parameters+1 ? 1-(1-r2)*(n-1)/(n-parameters-1) : r2;
  return {model,predict,equation,r2,adjustedR2};
}

function pearson(points) {
  const mx=average(points.map(p=>p.x)), my=average(points.map(p=>p.y));
  const numerator=points.reduce((sum,p)=>sum+(p.x-mx)*(p.y-my),0);
  const dx=Math.sqrt(points.reduce((sum,p)=>sum+(p.x-mx)**2,0));
  const dy=Math.sqrt(points.reduce((sum,p)=>sum+(p.y-my)**2,0));
  return dx && dy ? numerator/(dx*dy) : 0;
}

function extent(values) {
  const min=Math.min(...values), max=Math.max(...values);
  if (Math.abs(max-min)<1e-12) { const pad=Math.max(Math.abs(max)*.08,1); return [min-pad,max+pad]; }
  const pad=(max-min)*.08; return [min-pad,max+pad];
}

function chart(points, xKey, yKey, fit) {
  const width=920,height=390,left=82,right=34,top=26,bottom=66;
  const xe=extent(points.map(p=>p.x));
  const curve=Array.from({length:61},(_,i)=>{const x=xe[0]+i/60*(xe[1]-xe[0]); return {x,y:fit.predict(x)}}).filter(p=>Number.isFinite(p.y));
  const ye=extent([...points.map(p=>p.y),...curve.map(p=>p.y)]);
  const sx=v=>left+(v-xe[0])/(xe[1]-xe[0])*(width-left-right);
  const sy=v=>height-bottom-(v-ye[0])/(ye[1]-ye[0])*(height-top-bottom);
  const ticks=(min,max)=>Array.from({length:5},(_,i)=>min+i/4*(max-min));
  return `<svg class="regression-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metricMeta(yKey)[1])} versus ${escapeHtml(metricMeta(xKey)[1])}">
    ${ticks(ye[0],ye[1]).map(v=>`<line class="reg-grid" x1="${left}" y1="${sy(v)}" x2="${width-right}" y2="${sy(v)}"></line><text text-anchor="end" x="${left-10}" y="${sy(v)+4}">${escapeHtml(formatMetric(yKey,v))}</text>`).join("")}
    ${ticks(xe[0],xe[1]).map(v=>`<line class="reg-grid" x1="${sx(v)}" y1="${top}" x2="${sx(v)}" y2="${height-bottom}"></line><text text-anchor="middle" x="${sx(v)}" y="${height-bottom+24}">${escapeHtml(formatMetric(xKey,v))}</text>`).join("")}
    <line class="reg-axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"></line><line class="reg-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"></line>
    <polyline class="reg-line" fill="none" points="${curve.map(p=>`${sx(p.x)},${sy(p.y)}`).join(" ")}"></polyline>
    ${points.map(p=>`<circle class="reg-point" cx="${sx(p.x)}" cy="${sy(p.y)}" r="5"><title>${escapeHtml(formatDate(p.date))} · ${escapeHtml(p.customer)} · ${escapeHtml(formatMetric(xKey,p.x))} / ${escapeHtml(formatMetric(yKey,p.y))}</title></circle>`).join("")}
    <text class="reg-axis-title" text-anchor="middle" x="${(left+width-right)/2}" y="${height-14}">${escapeHtml(metricMeta(xKey)[1])}</text>
    <text class="reg-axis-title" text-anchor="middle" transform="translate(18 ${(top+height-bottom)/2}) rotate(-90)">${escapeHtml(metricMeta(yKey)[1])}</text>
  </svg>`;
}

function relationshipText(xKey,yKey,corr,r2) {
  const x=metricMeta(xKey)[1].toLowerCase(), y=metricMeta(yKey)[1].toLowerCase();
  const strength=Math.abs(corr)>=.6?"strong":Math.abs(corr)>=.4?"moderate":Math.abs(corr)>=.2?"weak":"very weak";
  const direction=corr>.1?"higher":corr<-.1?"lower":"little consistent change in";
  const caution=r2>=.6?"The fitted model explains a meaningful share of the variation.":r2>=.3?"The model captures part of the relationship, but other factors still matter.":"The model explains only a small share of the variation, so this should not be treated as strongly predictive.";
  return `There is a ${strength} historical relationship: as ${x} increases, the observations are associated with ${direction} ${y}. ${caution}`;
}

function stat(label,value,note) { return `<div class="reg-stat"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`; }

function renderAnalysis(observations,xKey,yKey,model) {
  if (xKey===yKey) return `<div class="dashboard-empty"><strong>Choose two different variables</strong><span>Select a different X or Y variable.</span></div>`;
  const points=observations.map(row=>({date:row.date,customer:row.customer,x:Number(row[xKey]),y:Number(row[yKey])})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if (points.length<3) return `<div class="dashboard-empty"><strong>Not enough paired observations</strong><span>At least three sales with both selected values are required.</span></div>`;
  const candidates=["linear","quadratic","logarithmic","exponential"].map(m=>fitRegression(points,m)).filter(Boolean);
  const fit=model==="auto" ? candidates.slice().sort((a,b)=>b.adjustedR2-a.adjustedR2)[0] : candidates.find(c=>c.model===model);
  if (!fit) return `<div class="dashboard-empty"><strong>Model unavailable</strong><span>Try Auto fit or Linear for these values.</span></div>`;
  const corr=pearson(points), modelName=MODELS.find(([v])=>v===fit.model)?.[1]||fit.model;
  return `<div class="reg-card">
    <div class="reg-heading"><div><span class="eyebrow">RELATIONSHIP ANALYSIS</span><h3>${escapeHtml(metricMeta(yKey)[1])} vs ${escapeHtml(metricMeta(xKey)[1])}</h3><p>Each point is one completed sales observation in the selected period.</p></div><span class="reg-model-pill">${escapeHtml(modelName)}</span></div>
    ${chart(points,xKey,yKey,fit)}
    <div class="reg-stats">${stat("R²",fit.r2.toFixed(3),"Variation explained")}${stat("Correlation",`${corr>0?"+":""}${corr.toFixed(3)}`,Math.abs(corr)>=.6?"Strong":Math.abs(corr)>=.4?"Moderate":Math.abs(corr)>=.2?"Weak":"Very weak")}${stat("Observations",String(points.length),"Completed sales")}${stat("Model",modelName,model==="auto"?"Best adjusted R²":"Selected fit")}</div>
    <div class="reg-summary"><div><span>Equation</span><strong>${escapeHtml(fit.equation)}</strong></div><p>${escapeHtml(relationshipText(xKey,yKey,corr,fit.r2))}</p></div>
  </div>`;
}

async function enhanceCompare() {
  if (rendering) return;
  const legacySelect=document.querySelector('[data-comparison-mode]');
  const tab=legacySelect?.closest('.product-tab-content');
  if (!legacySelect || !tab || tab.dataset.regressionEnhanced==="1") return;
  rendering=true;
  try {
    const data=await reportsData();
    const productId=document.querySelector('[data-dashboard-product]')?.value || String(location.hash).split(':')[1] || "";
    const product=data.productAnalytics?.[decodeURIComponent(productId)];
    if (!product) return;
    const period=document.querySelector('[data-dashboard-period]')?.value || "90";
    const observations=salesObservations(product,period);
    tab.dataset.regressionEnhanced="1";
    tab.innerHTML=`<div class="reg-controls"><label class="dashboard-field"><span>X variable</span><select data-reg-x>${selectOptions(METRICS,"quantity_lb")}</select></label><label class="dashboard-field"><span>Y variable</span><select data-reg-y>${selectOptions(METRICS,"estimated_margin_percent")}</select></label><label class="dashboard-field"><span>Trend model</span><select data-reg-model>${selectOptions(MODELS,"auto")}</select></label></div><div data-reg-output></div>`;
    const x=tab.querySelector('[data-reg-x]'), y=tab.querySelector('[data-reg-y]'), model=tab.querySelector('[data-reg-model]'), output=tab.querySelector('[data-reg-output]');
    const draw=()=>{output.innerHTML=renderAnalysis(observations,x.value,y.value,model.value)};
    [x,y,model].forEach(el=>el.addEventListener('change',draw));
    draw();
  } finally { rendering=false; }
}

function installStyles() {
  if (document.getElementById('reportsRegressionStyles')) return;
  const style=document.createElement('style'); style.id='reportsRegressionStyles';
  style.textContent=`.reg-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px;margin-bottom:14px;background:#f5faf7;border:1px solid #d7e4da;border-radius:14px}.reg-card{border:1px solid #d8e3db;border-radius:16px;padding:18px;background:#fff}.reg-heading{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.reg-heading h3{margin:4px 0}.reg-heading p{margin:4px 0 0;color:#6d7a72;font-size:12px}.reg-model-pill{background:#edf7f0;border:1px solid #cde2d3;color:#226b3d;border-radius:999px;padding:7px 11px;font-size:11px;font-weight:850;white-space:nowrap}.regression-chart{width:100%;height:auto;margin-top:12px;background:#fbfcfb;border:1px solid #e2e9e4;border-radius:12px}.regression-chart text{fill:#708078;font-size:10px}.reg-grid{stroke:#edf1ee}.reg-axis{stroke:#c8d3cb}.reg-line{stroke:#8b6b2c;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.reg-point{fill:#226b3d;stroke:#fff;stroke-width:2;opacity:.85}.reg-axis-title{fill:#36463c!important;font-size:12px!important;font-weight:800}.reg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.reg-stat{background:#f8fbf9;border:1px solid #e0e8e2;border-radius:11px;padding:12px}.reg-stat span,.reg-stat small{display:block;color:#708078;font-size:10px}.reg-stat span{font-weight:850;text-transform:uppercase;letter-spacing:.05em}.reg-stat strong{display:block;color:#17211b;font-size:18px;margin:5px 0 2px}.reg-summary{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(0,1.7fr);gap:12px;margin-top:12px;padding:13px 14px;background:#f3f8f5;border-left:4px solid #226b3d;border-radius:10px}.reg-summary span{display:block;color:#68776c;font-size:10px;font-weight:850;text-transform:uppercase}.reg-summary strong{display:block;margin-top:4px;font-size:13px;overflow-wrap:anywhere}.reg-summary p{margin:0;color:#536259;font-size:12px;line-height:1.5}@media(max-width:900px){.reg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.reg-controls,.reg-summary{grid-template-columns:1fr}.reg-heading{flex-direction:column}.reg-stats{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

installStyles();
const observer=new MutationObserver(()=>enhanceCompare());
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(enhanceCompare,0));
setTimeout(enhanceCompare,0);
