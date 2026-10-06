// Central risk-based approval engine.
import { activeUsers, initStaff, verifyStaffPin, ROLES } from "./staff.js";
import { $, esc, icon, openModal } from "./ui.js";
import { recordAudit } from "./audit-log.js";

const ROLE_ORDER = { cashier: 1, manager: 2, admin: 3 };
export const approvalPolicy = { discount: { managerPct: 5, adminPct: 15 }, refund: { managerAmount: 1000, adminAmount: 5000 }, stock: { managerQty: 20, adminQty: 100 } };
function eligible(minRole) { return activeUsers().filter((u) => ROLE_ORDER[u.role] >= ROLE_ORDER[minRole]); }

export async function requestApproval({ action, minRole = "manager", detail = "" } = {}) {
  await initStaff();
  const candidates = eligible(minRole);
  if (!candidates.length) throw new Error(`A ${ROLES[minRole]?.label || minRole} approval is required, but no eligible active user is available.`);
  return new Promise((resolve, reject) => {
    let approved = false;
    const m = openModal({
      title: `Approval required · ${action || "Sensitive action"}`,
      sub: detail || `A ${ROLES[minRole]?.label || minRole} must approve this action.`,
      size: "sm",
      body: `<div class="field"><label>Approver</label><select class="input" id="approvalUser">${candidates.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(ROLES[u.role].label)}</option>`).join("")}</select></div><div class="field" style="margin-top:12px"><label>Approver PIN</label><input class="input" id="approvalPin" type="password" inputmode="numeric" maxlength="12" autocomplete="off" placeholder="Enter PIN"></div><div class="staff-pin-error" id="approvalError"></div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="approvalGo">${icon("check")} Approve</button>`,
      onClose: () => { if (!approved) reject(new Error("Approval cancelled.")); },
    });
    const submit = async () => {
      const user = candidates.find((u) => u.id === m.$("#approvalUser").value);
      const pin = m.$("#approvalPin").value.trim(); const err = m.$("#approvalError");
      if (!user || !pin) { err.textContent = "Select an approver and enter the PIN."; return; }
      const go = m.$("#approvalGo"); go.disabled = true; err.textContent = "";
      try { if (!(await verifyStaffPin(user, pin))) throw new Error("Incorrect approver PIN."); const at = new Date().toISOString(); try { await recordAudit({ action: "Approval granted", module: "Security", detail: `${action || "Sensitive action"} · ${detail || ""}`, entity: user.id, level: "info" }); } catch (auditError) { console.warn("Approval audit recording failed; continuing with approved action.", auditError); } approved = true; m.close(); resolve({ userId: user.id, name: user.name, role: user.role, at }); }
      catch (e) { err.textContent = e.message || "Approval failed."; go.disabled = false; m.$("#approvalPin").select(); }
    };
    m.$("#approvalGo").onclick = submit;
    m.$("#approvalPin").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    setTimeout(() => m.$("#approvalPin").focus(), 40);
  });
}

export function requiredRoleForDiscount(subtotal, type, value) { const amount = type === "percent" ? Number(subtotal || 0) * Number(value || 0) / 100 : Number(value || 0); const pct = Number(subtotal || 0) > 0 ? amount / Number(subtotal) * 100 : 0; if (pct > approvalPolicy.discount.adminPct) return "admin"; if (pct > approvalPolicy.discount.managerPct) return "manager"; return null; }
export function requiredRoleForStock(quantity, mode) { const q = Math.abs(Number(quantity) || 0); if (mode === "set" || q > approvalPolicy.stock.adminQty) return "admin"; if (q > approvalPolicy.stock.managerQty || mode === "remove") return "manager"; return null; }
export function requiredRoleForRefund(amount) { const a = Math.abs(Number(amount) || 0); if (a > approvalPolicy.refund.adminAmount) return "admin"; if (a > approvalPolicy.refund.managerAmount) return "manager"; return null; }
