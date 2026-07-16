import { clearApiCache, getPurchaseOrderDetail, listLocations, listPurchaseOrders, receiveProduct } from "../js/api-smooth1.js?v=receiving-capacity1";
import { recommendPutawayLocations } from "../js/receiving-api.js?v=1";
import { handleKeyboardScan, startCameraScanner, stopCameraScanner } from "../js/scanner.js?v=smooth1";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js";
import { ensureReceivingStyles, friendlyUnit, normalizeStatus, orderLinesHtml, pageHtml, palletCardsHtml } from "./receiving-simple-ui.js?v=1";

const RECEIVABLE = ["DRAFT","SENT","CONFIRMED","ORDERED","IN_TRANSIT","PARTIALLY_RECEIVED"];
const TOL = .01, MAX_PALLETS = 100;
let order=null, locations=[], lineId="", scannedLineId="", pallets=[], scanPallet=null, requestId=0, timer=null, submitting=false, ctx=null;

export async function render(context) {
  ctx=context; ensureReceivingStyles(); context.setTitle("Receive Product","Enter pallet capacity, confirm locations, and receive");
  const [orders, warehouse]=await Promise.all([listPurchaseOrders(),listLocations()]);
  locations=warehouse; resetState();
  context.view.innerHTML=pageHtml(orders.filter((po)=>RECEIVABLE.includes(normalizeStatus(po.po_status))));
  document.getElementById("poSelect").addEventListener("change",(e)=>loadOrder(e.target.value).catch(showError));
  handleKeyboardScan(document.getElementById("receiveScan"),(value)=>handleProductScan(value).catch(showError));
  document.getElementById("scanReceiveQr").addEventListener("click",()=>startCamera("product"));
  document.getElementById("refreshRecommendations").addEventListener("click",()=>recommend(true));
  const form=document.getElementById("receiveForm");
  form.addEventListener("input",onInput); form.addEventListener("change",onChange); form.addEventListener("click",onClick); form.addEventListener("submit",submit);
}

function resetState(){order=null;lineId="";scannedLineId="";pallets=[];scanPallet=null;requestId++;if(timer)window.clearTimeout(timer);timer=null;submitting=false}

async function loadOrder(poId,options={}){
  if(!poId)return resetWorkspace();
  const detail=await getPurchaseOrderDetail(poId); if(!detail)throw new Error("Purchase order was not found.");
  order=detail;lineId=options.lineId||"";scannedLineId=options.scannedLineId||"";pallets=[];
  document.getElementById("poSelect").value=poId;
  document.getElementById("receivingOrderTitle").textContent=poId;
  document.getElementById("receivingOrderMeta").textContent=`${detail.po.supplier?.supplier_name||detail.po.supplier_id} · ${detail.lines.length} product${detail.lines.length===1?"":"s"}`;
  document.getElementById("receivingOrderStatus").textContent=normalizeStatus(detail.po.po_status)||"OPEN";
  renderLines();document.getElementById("receivingDetails").hidden=true;
  if(options.lineId)selectLine(options.lineId,Boolean(options.scannedLineId));
}

function renderLines(){document.getElementById("poLines").innerHTML=orderLinesHtml(order,lineId,scannedLineId,lineRemaining)}

function selectLine(id,fromScan){
  const line=getLine(id);if(!line)throw new Error("The selected product is not part of this purchase order.");if(lineRemaining(line)<=TOL)throw new Error("This product has already been fully received.");
  lineId=id;if(fromScan)scannedLineId=id;pallets=[];renderLines();
  const form=document.getElementById("receiveForm");document.getElementById("receivingDetails").hidden=false;
  document.getElementById("selectedProductName").textContent=line.product?.product_name||line.product_id;
  document.getElementById("selectedProductSummary").textContent=`${formatQuantity(lineRemaining(line))} ${line.unit_type} remaining · ${formatQuantity(unitWeight(line))} LB each`;
  document.getElementById("unitsPerPalletLabel").textContent=`${friendlyUnit(line.unit_type)} per pallet`;
  document.getElementById("scanLockStatus").hidden=!scannedLineId;
  form.elements.qty_received.value=clean(lineRemaining(line));form.elements.qty_damaged.value="0";form.elements.units_per_pallet.value="";
  form.elements.quality_status.value="PASS";form.elements.quality_score.value="5";form.elements.supplier_lot_number.value=line.supplier_expected_lot_number||"";
  form.elements.allow_over_receipt.checked=false;form.elements.notes.value="";buildPlan();
  window.setTimeout(()=>form.elements.units_per_pallet.focus(),0);
}

function onInput(e){if(["qty_received","qty_damaged","units_per_pallet"].includes(e.target.name))buildPlan();else updateState()}
function onChange(e){
  if(e.target.name==="po_line_id")return selectLine(e.target.value,false);
  if(e.target.name==="quality_status"){document.getElementById("receiveForm").elements.quality_score.value=qualityScore(e.target.value);return buildPlan()}
  if(e.target.matches("[data-pallet-location]")){const i=Number(e.target.dataset.palletLocation);if(pallets[i])pallets[i].confirmed_location_id=e.target.value;renderCards()}
  updateState();
}
function onClick(e){const button=e.target.closest("[data-scan-pallet]");if(button){scanPallet=Number(button.dataset.scanPallet);startCamera("location")}}

function buildPlan(){
  const form=document.getElementById("receiveForm"),line=getLine();if(!form||!line)return;
  const rejected=form.elements.quality_status.value==="REJECTED", workspace=document.getElementById("palletWorkspace"), capacityField=document.getElementById("palletCapacityField");
  workspace.hidden=rejected;capacityField.hidden=rejected;form.elements.units_per_pallet.required=!rejected;form.elements.units_per_pallet.disabled=rejected;
  if(rejected){pallets=[];renderCards();return updateState()}
  const accepted=acceptedQty(),per=number(form.elements.units_per_pallet.value);
  if(accepted<=TOL||per<=0){pallets=[];renderCards();return updateState()}
  const count=Math.ceil(accepted/per-1e-9);
  if(count>MAX_PALLETS){pallets=[];document.getElementById("recommendationStatus").textContent=`More than ${MAX_PALLETS} pallets. Increase the amount per pallet.`;return updateState()}
  const previous=pallets;let assigned=0;
  pallets=Array.from({length:count},(_,i)=>{const qty=i===count-1?round(accepted-assigned):round(Math.min(per,accepted-assigned));assigned=round(assigned+qty);return{pallet_number:i+1,purchase_qty:qty,recommended_location_id:previous[i]?.recommended_location_id||"",confirmed_location_id:previous[i]?.confirmed_location_id||""}});
  renderCards();updateState();if(timer)window.clearTimeout(timer);timer=window.setTimeout(()=>recommend(false),300);
}

async function recommend(force){
  const form=document.getElementById("receiveForm"),line=getLine();if(!form||!line||form.elements.quality_status.value==="REJECTED"||!pallets.length)return;
  const current=++requestId,status=document.getElementById("recommendationStatus");status.textContent="Finding available locations…";
  try{
    const result=await recommendPutawayLocations(ctx.user,{po_id:order.po.po_id,po_line_id:line.po_line_id,qty_received:number(form.elements.qty_received.value),qty_damaged:number(form.elements.qty_damaged.value),qty_accepted:round(number(form.elements.units_per_pallet.value)*pallets.length),pallet_count:pallets.length,exclude_location_ids:[]});
    if(current!==requestId)return;const recs=result?.recommendations||[];
    pallets.forEach((p,i)=>{const rec=recs[i];if(!rec){if(force){p.recommended_location_id="";p.confirmed_location_id=""}return}const id=rec.location_id||rec.recommended_location_id||"";p.recommended_location_id=id;if(force||!p.confirmed_location_id||!isReceivable(p.confirmed_location_id))p.confirmed_location_id=id});
    status.textContent=recs.length===pallets.length?"Locations ready. Review and receive.":`${recs.length} of ${pallets.length} locations available.`;renderCards();updateState();
  }catch(error){if(current!==requestId)return;status.textContent=error.message;updateState()}
}

function renderCards(){
  const line=getLine(),grid=document.getElementById("palletGrid"),heading=document.getElementById("palletHeading");if(!grid||!heading)return;
  heading.textContent=pallets.length?`${pallets.length} pallet${pallets.length===1?"":"s"}`:"Pallets";
  if(!line||!pallets.length){grid.innerHTML="";const form=document.getElementById("receiveForm");if(form?.elements.quality_status.value!=="REJECTED")document.getElementById("recommendationStatus").textContent="Enter units per pallet.";return}
  grid.innerHTML=palletCardsHtml(line,pallets,locations,isReceivable);
}

function updateState(){
  const form=document.getElementById("receiveForm"),line=getLine();if(!form||!line)return;
  const quality=form.elements.quality_status.value,accepted=acceptedQty(),per=number(form.elements.units_per_pallet.value),remaining=lineRemaining(line),after=Math.max(0,round(remaining-accepted)),over=round(accepted-remaining),isOver=over>TOL,role=String(ctx?.user?.role||"").toUpperCase(),canApprove=["ADMIN","MANAGER"].includes(role),overOk=!isOver||(canApprove&&form.elements.allow_over_receipt.checked);
  const rejectedOk=quality==="REJECTED"&&accepted<=TOL&&Math.abs(number(form.elements.qty_received.value)-number(form.elements.qty_damaged.value))<=TOL;
  const assigned=round(pallets.reduce((sum,p)=>sum+number(p.purchase_qty),0)),qtyOk=pallets.length>0&&Math.abs(assigned-accepted)<=TOL,chosen=pallets.map((p)=>p.confirmed_location_id).filter(Boolean),unique=new Set(chosen),locationsOk=pallets.length>0&&chosen.length===pallets.length&&unique.size===chosen.length&&pallets.every((p)=>isReceivable(p.confirmed_location_id)),weightOk=unitWeight(line)>0,lotOk=Boolean(form.elements.supplier_lot_number.value.trim()),capacityOk=per>0&&pallets.length<=MAX_PALLETS;
  document.getElementById("receivingSummary").innerHTML=quality==="REJECTED"?`<strong>Rejected delivery</strong><span>No inventory will be added.</span>`:`<strong>${formatQuantity(accepted)} ${escapeHtml(line.unit_type)}</strong><span>${pallets.length?`${pallets.length} pallet${pallets.length===1?"":"s"}`:"Enter units per pallet"}${after>TOL?` · ${formatQuantity(after)} remaining`:""}</span>`;
  const approval=document.getElementById("overReceiptApproval");approval.hidden=!isOver;document.getElementById("overReceiptText").textContent=canApprove?`Approve ${formatQuantity(over)} ${line.unit_type} above the PO.`:`${formatQuantity(over)} ${line.unit_type} above the PO. A manager must complete it.`;form.elements.allow_over_receipt.disabled=!canApprove;
  const ready=quality==="REJECTED"?rejectedOk&&lotOk:accepted>TOL&&capacityOk&&qtyOk&&locationsOk&&weightOk&&lotOk&&overOk;
  const readiness=document.getElementById("receivingReadiness");readiness.textContent=ready?(quality==="REJECTED"?"Ready to record rejection":"Ready to receive"):message({quality,accepted,per,locationsOk,weightOk,lotOk,overOk});readiness.className=ready?"is-ready":"";
  document.getElementById("receivingCompletionNote").textContent=ready&&quality!=="REJECTED"?`${pallets.length} location${pallets.length===1?"":"s"} selected.`:"";document.getElementById("completeReceiving").disabled=!ready||submitting;
}

async function submit(event){
  event.preventDefault();if(submitting)return;const form=event.currentTarget,line=getLine();if(!line)return notice("Select or scan a product.");updateState();
  const button=document.getElementById("completeReceiving");if(button.disabled)return notice("Complete the required receiving details.");const quality=form.elements.quality_status.value;
  const input={po_id:order.po.po_id,po_line_id:line.po_line_id,scan_code:form.elements.scan_code.value,qty_received:number(form.elements.qty_received.value),qty_damaged:number(form.elements.qty_damaged.value),quality_status:quality,quality_score:qualityScore(quality),supplier_lot_number:form.elements.supplier_lot_number.value.trim(),pallet_count:quality==="REJECTED"?0:pallets.length,allow_over_receipt:form.elements.allow_over_receipt.checked,notes:form.elements.notes.value.trim(),pallet_placements:quality==="REJECTED"?[]:pallets.map((p,i)=>({pallet_number:i+1,purchase_qty:round(p.purchase_qty),base_qty:round(p.purchase_qty*unitWeight(line)),recommended_location_id:p.recommended_location_id,confirmed_location_id:p.confirmed_location_id}))};
  submitting=true;button.disabled=true;button.textContent="Receiving…";
  try{const result=await receiveProduct(ctx.user,input);clearApiCache();notice(result?.rejected?`Rejected delivery recorded for ${line.product?.product_name||line.product_id}.`:`${(result?.lots||[result?.lot].filter(Boolean)).length} pallet${(result?.lots||[result?.lot].filter(Boolean)).length===1?"":"s"} received successfully.`);const updated=await getPurchaseOrderDetail(order.po.po_id),next=updated?.lines?.find((row)=>lineRemaining(row)>TOL);await loadOrder(order.po.po_id,next?{lineId:next.po_line_id}:{})}catch(error){notice(error.message)}finally{submitting=false;button.textContent="Receive inventory";updateState()}
}

async function handleProductScan(value){
  const parsed=parseQr(value);if(!parsed)throw new Error("This is not a valid purchase-order product QR.");const poId=parsed.poId||order?.po?.po_id||"";if(!poId)throw new Error("Select the purchase order before scanning this legacy QR.");
  await loadOrder(poId);const line=order.lines.find((row)=>parsed.poLineId?row.po_line_id===parsed.poLineId:row.product_id===parsed.productId);if(!line)throw new Error("The scanned product is not part of this purchase order.");scannedLineId=line.po_line_id;selectLine(line.po_line_id,true);document.getElementById("receiveForm").elements.supplier_lot_number.value=parsed.supplierLot||line.supplier_expected_lot_number||"";document.getElementById("receiveScanValue").value=value;document.getElementById("receiveResult").innerHTML=`<strong>${escapeHtml(line.product?.product_name||line.product_id)} selected</strong><br>${escapeHtml(poId)} · ${escapeHtml(formatQuantity(lineRemaining(line)))} ${escapeHtml(line.unit_type)} remaining`;
}

function handleLocationScan(index,value){
  if(!Number.isInteger(index)||!pallets[index])return;const scan=String(value||"").trim(),location=locations.find((row)=>[row.location_id,row.qr_value].map(String).includes(scan));if(!location)return notice(`Location QR not found: ${scan}`);if(!isReceivable(location.location_id))return notice(`${location.location_id} is not available.`);if(pallets.some((p,i)=>i!==index&&p.confirmed_location_id===location.location_id))return notice(`${location.location_id} is already assigned to another pallet.`);pallets[index].confirmed_location_id=location.location_id;renderCards();updateState();
}

async function startCamera(mode){
  try{const inputId=mode==="location"?"receivingLocationCameraTarget":"receiveScan";if(mode==="location"&&!document.getElementById(inputId)){const input=document.createElement("input");input.id=inputId;input.type="hidden";document.body.appendChild(input)}await startCameraScanner(inputId,(value)=>{if(mode==="location")handleLocationScan(scanPallet,value);else handleProductScan(value).catch(showError);stopCameraScanner()})}catch(error){showError(error)}
}

function isReceivable(id){const row=locations.find((x)=>String(x.location_id)===String(id));if(!row)return false;if(row.is_receivable!==undefined)return row.is_receivable===true||String(row.is_receivable).toUpperCase()==="TRUE";const active=row.is_active===undefined||row.is_active===true||String(row.is_active).toUpperCase()==="TRUE",status=String(row.current_status||"AVAILABLE").toUpperCase();return active&&!["BLOCKED","UNAVAILABLE","OCCUPIED","FULL","MAINTENANCE","INACTIVE"].includes(status)}
function getLine(id=lineId){return order?.lines?.find((row)=>String(row.po_line_id)===String(id))}
function acceptedQty(){const form=document.getElementById("receiveForm");return Math.max(0,round(number(form?.elements.qty_received?.value)-number(form?.elements.qty_damaged?.value)))}
function unitWeight(line){return number(line?.case_weight_lbs||line?.units_per_purchase_unit,0)}
function lineRemaining(line){const value=Number(line?.qty_remaining);return line?.qty_remaining!==""&&line?.qty_remaining!=null&&Number.isFinite(value)?Math.max(0,value):Math.max(0,number(line?.qty_ordered)-number(line?.qty_received_total))}
function message({quality,accepted,per,locationsOk,weightOk,lotOk,overOk}){if(!lotOk)return"Enter the supplier lot number";if(quality==="REJECTED")return"Mark the full received quantity as rejected";if(accepted<=TOL)return"Accepted quantity must be greater than zero";if(per<=0)return"Enter cases or units per pallet";if(!weightOk)return"The PO line needs a valid unit weight";if(!locationsOk)return"Confirm one available location per pallet";if(!overOk)return"Manager approval is required";return"Complete the receiving details"}
function resetWorkspace(){resetState();document.getElementById("receivingOrderTitle").textContent="Purchase Order";document.getElementById("receivingOrderMeta").textContent="No purchase order selected.";document.getElementById("receivingOrderStatus").textContent="WAITING";document.getElementById("poLines").innerHTML=`<div class="empty">Products from the purchase order will appear here.</div>`;document.getElementById("receivingDetails").hidden=true}
function parseQr(value){try{const p=JSON.parse(String(value||""));if(p?.type==="PO_LINE"&&p.product_id)return{poId:p.po_id||"",poLineId:p.po_line_id||"",productId:p.product_id,supplierLot:p.supplier_lot_number==="PENDING"?"":p.supplier_lot_number||""}}catch(_error){}const parts=String(value||"").split("|").map((x)=>x.trim());if(parts.length<2||!parts[1].startsWith("QTY:"))return null;return{poId:"",poLineId:"",productId:parts[0],supplierLot:parts.find((x)=>x.startsWith("SUPLOT:"))?.replace("SUPLOT:","")||""}}
function qualityScore(status){return status==="PASS"?5:status==="HOLD"?3:1}
function number(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback}
function round(value){return Math.round((number(value)+Number.EPSILON)*100)/100}
function clean(value){return String(round(value))}
function showError(error){notice(error?.message||String(error))}
