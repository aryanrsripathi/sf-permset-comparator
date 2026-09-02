/* Salesforce Permission Set Comparator v2
 *
 * No tokens: the extension reads the `sid` session cookies Salesforce sets
 * when you log in (same technique as Salesforce Inspector). Each detected
 * session is validated against the REST API, labeled with the org's name
 * and Production/Sandbox type, and offered in the org dropdowns.
 */

const API_VERSION = "v60.0";

const TYPE_LABELS = {
  TabSet: "Assigned Apps",
  ConnectedApplication: "Assigned Connected Apps",
  ApexClass: "Apex Class Access",
  ApexPage: "Visualforce Page Access",
  ExternalDataSource: "External Data Source Access",
  FlowDefinition: "Flow Access",
  NamedCredential: "Named Credential Access",
  ExternalCredentialPrincipal: "External Credential Principal Access",
  ExternalCredentialParameter: "External Credential Principal Access",
  DataCategoryGroup: "Data Category Visibility",
  ServicePresenceStatus: "Service Presence Statuses Access",
  CustomPermission: "Custom Permissions",
  CustomEntityDefinition: "Custom Metadata Types / Custom Settings",
  OrgWideEmailAddress: "Organization-Wide Email Address Access",
  StandardInvocableActionType: "Standard Invocable Action Type Access",
  EmailRoutingAddress: "Email-to-Case Routing Address Access",
  ServiceProvider: "Service Providers",
};

// ---------------------------------------------------------------------------
// Org auto-detection from browser session cookies
// ---------------------------------------------------------------------------

let detectedOrgs = []; // [{ key, label, url, token, orgId }]

async function detectOrgs() {
  const cookies = await chrome.cookies.getAll({ name: "sid" });
  // Keep only API-capable hosts: *.my.salesforce.com (and classic
  // instance domains like na139.salesforce.com), not lightning.force.com.
  const candidates = cookies.filter((c) => {
    const d = c.domain.replace(/^\./, "");
    return d.endsWith(".salesforce.com") && !d.startsWith("login.") &&
           !d.startsWith("test.");
  });

  const seen = new Set();
  const orgs = [];
  await Promise.all(candidates.map(async (c) => {
    const host = c.domain.replace(/^\./, "");
    const orgId = c.value.split("!")[0];
    const key = orgId + "|" + host;
    if (seen.has(key)) return;
    seen.add(key);
    const org = { url: "https://" + host, token: c.value, orgId, key };
    try {
      const recs = await sfQuery(
        org, "SELECT Name, IsSandbox, InstanceName FROM Organization");
      const o = recs[0];
      org.label = `${o.Name} (${o.IsSandbox ? "Sandbox" : "Production"}) — ${host}`;
      // Prefer one entry per org id: my.salesforce.com host wins
      const dupe = orgs.findIndex((x) => x.orgId === orgId);
      if (dupe >= 0) {
        if (host.includes(".my.salesforce.com")) orgs[dupe] = org;
      } else {
        orgs.push(org);
      }
    } catch (e) {
      /* stale or non-API cookie — ignore */
    }
  }));
  orgs.sort((a, b) => a.label.localeCompare(b.label));
  return orgs;
}

function fillOrgSelect(sel, orgs, excludeIdx) {
  const current = sel.value;
  sel.innerHTML = '<option value="">— choose an org —</option>' +
    orgs.map((o, i) => i === excludeIdx ? "" :
      `<option value="${i}">${esc(o.label)}</option>`).join("");
  // Keep the current selection if it's still available
  if (current !== "" && Number(current) !== excludeIdx) sel.value = current;
}

// An org picked on one side disappears from the other side's options
function syncOrgOptions() {
  const s1 = document.getElementById("org1-select");
  const s2 = document.getElementById("org2-select");
  const v1 = s1.value === "" ? -1 : Number(s1.value);
  const v2 = s2.value === "" ? -1 : Number(s2.value);
  fillOrgSelect(s1, detectedOrgs, v2);
  fillOrgSelect(s2, detectedOrgs, v1);
}

async function refreshOrgs() {
  const s1 = document.getElementById("org1-select");
  const s2 = document.getElementById("org2-select");
  s1.innerHTML = s2.innerHTML = "<option>Detecting orgs…</option>";
  detectedOrgs = await detectOrgs();
  document.getElementById("no-orgs").style.display =
    detectedOrgs.length ? "none" : "block";
  s1.value = s2.value = "";
  fillOrgSelect(s1, detectedOrgs, -1);
  fillOrgSelect(s2, detectedOrgs, -1);
  onOrgSelectionChange();
}

// ---------------------------------------------------------------------------
// Permission set picker
// ---------------------------------------------------------------------------

let permsetOptions = []; // [{ name, label, inOrg2 }]

function selectedOrg(which) {
  const v = document.getElementById(`org${which}-select`).value;
  if (v === "") return null;
  const org = detectedOrgs[Number(v)];
  return org ? { ...org, label: `Org ${which}` } : null;
}

async function loadPermsets() {
  const org1 = selectedOrg(1), org2 = selectedOrg(2);
  const input = document.getElementById("permset");
  const list = document.getElementById("permset-list");
  input.value = "";
  list.innerHTML = "";
  permsetOptions = [];
  document.getElementById("compare").disabled = true;

  if (!org1 || !org2) {
    input.disabled = true;
    input.placeholder = "Select both orgs first…";
    return;
  }
  input.disabled = true;
  input.placeholder = "Loading permission sets…";
  try {
    const soql = "SELECT Name, Label FROM PermissionSet " +
                 "WHERE IsOwnedByProfile = false ORDER BY Label";
    const [ps1, ps2] = await Promise.all([
      sfQuery(org1, soql), sfQuery(org2, soql)]);
    const names2 = new Set(ps2.map((p) => p.Name));
    permsetOptions = ps1.map((p) => ({
      name: p.Name, label: p.Label, inOrg2: names2.has(p.Name),
    }));
    list.innerHTML = permsetOptions.map((p) =>
      `<option value="${esc(p.name)}">${esc(p.label)}${
        p.inOrg2 ? "" : "  ⚠ not in Org 2"}</option>`).join("");
    input.disabled = false;
    input.placeholder = `${permsetOptions.length} permission sets — type to search`;
    document.getElementById("compare").disabled = false;
  } catch (e) {
    setStatus("Could not load permission sets: " + e.message, true);
    input.placeholder = "Failed to load permission sets";
  }
}

function onOrgSelectionChange() { syncOrgOptions(); loadPermsets(); }

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function sfFetch(org, path) {
  const url = path.startsWith("http") ? path : org.url.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + org.token },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${org.label || org.url}: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function sfQuery(org, soql, api) {
  const base = api === "tooling" ? "tooling/query" : "query";
  let data = await sfFetch(
    org, `/services/data/${API_VERSION}/${base}/?q=${encodeURIComponent(soql)}`);
  const records = data.records;
  while (!data.done && data.nextRecordsUrl) {
    data = await sfFetch(org, data.nextRecordsUrl);
    records.push(...data.records);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Extraction (same engine as v1)
// ---------------------------------------------------------------------------

// Split an array into chunks of at most `size` items.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getPermSetWithBooleans(org, name) {
  const desc = await sfFetch(
    org, `/services/data/${API_VERSION}/sobjects/PermissionSet/describe`);
  const permFieldMeta = desc.fields.filter((f) => f.name.startsWith("Permissions"));
  const permFields = permFieldMeta.map((f) => f.name);
  // Salesforce shows friendly labels ("Modify All Data"), not API names
  // ("PermissionsModifyAllData") — capture both from the describe result.
  const labels = {};
  for (const f of permFieldMeta) {
    const short = f.name.replace(/^Permissions/, "");
    labels[short] = (typeof LABEL_OVERRIDES !== "undefined" && LABEL_OVERRIDES[short])
      || f.label || f.name;
  }
  // Orgs can have 250+ Permissions* fields; selecting them all in one GET
  // query overflows the server's URL length limit (HTTP 431). Query in
  // batches and merge.
  const safeName = name.replace(/'/g, "\\'");
  // Name isn't unique across namespaces: a managed package can install a
  // permission set with the same Name. Prefer the org's own (non-namespaced)
  // one, and say so if there are several.
  const candidates = await sfQuery(org,
    `SELECT Id, NamespacePrefix FROM PermissionSet WHERE Name = '${safeName}'`);
  if (!candidates.length) {
    throw new Error(`${org.label}: permission set "${name}" not found`);
  }
  candidates.sort((a, b) =>
    (a.NamespacePrefix ? 1 : 0) - (b.NamespacePrefix ? 1 : 0));
  const chosen = candidates[0];
  const dupeNote = candidates.length > 1
    ? `${org.label}: ${candidates.length} permission sets are named "${name}" ` +
      `(namespaces: ${candidates.map((c) => c.NamespacePrefix || "none").join(", ")}); ` +
      `using the ${chosen.NamespacePrefix ? `"${chosen.NamespacePrefix}"` : "non-namespaced"} one.`
    : null;
  const id = chosen.Id;
  const perms = {};
  for (const fields of chunk(permFields, 60)) {
    const soql = `SELECT Id, ${fields.join(", ")} FROM PermissionSet ` +
                 `WHERE Id = '${id}'`;
    const recs = await sfQuery(org, soql);
    for (const f of fields) perms[f.replace(/^Permissions/, "")] = recs[0][f];
  }
  return { id, perms, labels, dupeNote };
}

async function getObjectPerms(org, psId) {
  const recs = await sfQuery(org, `
    SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit,
           PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
    FROM ObjectPermissions WHERE ParentId = '${psId}'`);
  const out = {};
  for (const r of recs) {
    out[r.SobjectType] = {
      Create: r.PermissionsCreate, Read: r.PermissionsRead,
      Edit: r.PermissionsEdit, Delete: r.PermissionsDelete,
      "View All": r.PermissionsViewAllRecords,
      "Modify All": r.PermissionsModifyAllRecords,
    };
  }
  return out;
}

async function getFieldPerms(org, psId) {
  const recs = await sfQuery(org, `
    SELECT Field, PermissionsRead, PermissionsEdit
    FROM FieldPermissions WHERE ParentId = '${psId}'`);
  const out = {};
  for (const r of recs) {
    out[r.Field] = { Read: r.PermissionsRead, Edit: r.PermissionsEdit };
  }
  return out;
}

async function getTabSettings(org, psId) {
  const out = {};
  try {
    const recs = await sfQuery(org, `
      SELECT Name, Visibility FROM PermissionSetTabSetting
      WHERE ParentId = '${psId}'`);
    for (const r of recs) out[r.Name] = { Visibility: r.Visibility };
  } catch (e) {
    console.warn("Tab settings unavailable:", e.message);
  }
  return out;
}

// Some SetupEntityTypes don't have a same-named queryable object in the
// standard REST API, so they need special lookups (or the Tooling API).
const SPECIAL_RESOLVERS = {
  FlowDefinition: [
    { obj: "FlowDefinitionView", idField: "DurableId", nameField: "ApiName" },
  ],
  OrgWideEmailAddress: [
    { obj: "OrgWideEmailAddress", idField: "Id", nameField: "Address" },
  ],
  // Assigned apps: TabSet isn't queryable. AppMenuItem covers apps visible
  // to the querying user; AppDefinition and Tooling CustomApplication catch
  // apps AppMenuItem can't see.
  TabSet: [
    { obj: "AppMenuItem", idField: "ApplicationId", nameField: "Label" },
    { obj: "AppMenuItem", idField: "ApplicationId", nameField: "Name" },
    { obj: "AppDefinition", idField: "DurableId", nameField: "Label", trim15: true },
    { obj: "CustomApplication", idField: "Id", nameField: "MasterLabel", api: "tooling" },
    { obj: "CustomApplication", idField: "Id", nameField: "DeveloperName", api: "tooling" },
  ],
  ConnectedApplication: [
    { obj: "ConnectedApplication", idField: "Id", nameField: "Name" },
    { obj: "AppMenuItem", idField: "ApplicationId", nameField: "Label" },
  ],
  // Custom metadata types & custom settings (01I… IDs): these are
  // CustomObject records in the Tooling API. EntityDefinition works too but
  // its DurableId is the 15-char ID, so it needs trimmed IDs.
  CustomEntityDefinition: [
    { obj: "CustomObject", idField: "Id", nameField: "DeveloperName", api: "tooling" },
    { obj: "EntityDefinition", idField: "DurableId", nameField: "QualifiedApiName", trim15: true },
  ],
  // External credential principals: only reliably queryable via Tooling API.
  ExternalCredentialParameter: [
    { obj: "ExternalCredentialParameter", idField: "Id", nameField: "ParameterName" },
    { obj: "ExternalCredentialParameter", idField: "Id", nameField: "ParameterName", api: "tooling" },
  ],
};

function genericAttempts(type) {
  const a = [];
  for (const f of ["DeveloperName", "Name", "MasterLabel"]) {
    a.push({ obj: type, idField: "Id", nameField: f });
  }
  // Tooling API exposes many setup objects the data API doesn't.
  for (const f of ["DeveloperName", "Name", "MasterLabel", "FullName"]) {
    a.push({ obj: type, idField: "Id", nameField: f, api: "tooling" });
  }
  return a;
}

async function resolveNames(org, type, ids) {
  const attempts = (SPECIAL_RESOLVERS[type] || []).concat(genericAttempts(type));
  const idList = [...ids];
  const map = {}; // id (as returned by the source) -> name
  const isMapped = (i) => map[i] !== undefined || map[i.slice(0, 15)] !== undefined;

  for (const a of attempts) {
    const missing = idList.filter((i) => !isMapped(i));
    if (!missing.length) break; // everything resolved — stop early
    try {
      for (const batch of chunk(missing, 150)) {
        const queryIds = a.trim15 ? batch.map((i) => i.slice(0, 15)) : batch;
        const list = queryIds.map((i) => `'${i}'`).join(",");
        const recs = await sfQuery(
          org, `SELECT ${a.idField}, ${a.nameField} FROM ${a.obj} ` +
               `WHERE ${a.idField} IN (${list})`, a.api);
        for (const r of recs) {
          if (r[a.nameField]) map[r[a.idField]] = r[a.nameField];
        }
      }
    } catch (e) { /* source unavailable — try the next one */ }
  }

  const names = new Set();
  const nameToId = {};
  let allResolved = idList.length > 0;
  for (const i of idList) {
    const n = map[i] || map[i.slice(0, 15)];
    if (n === undefined) allResolved = false;
    const display = n || i;
    names.add(display);
    if (n) nameToId[display] = i;
  }
  return { names, nameToId, resolved: allResolved };
}

// Custom metadata types and custom settings share one SetupEntityType
// (CustomEntityDefinition). Salesforce's UI shows them as two sections, so
// split them via EntityDefinition.IsCustomSetting (DurableId is 15-char).
async function resolveCustomEntities(org, ids) {
  const empty = () => ({ names: new Set(), resolved: true });
  try {
    const map = {};
    for (const batch of chunk([...ids], 150)) {
      const idList = batch.map((i) => `'${i.slice(0, 15)}'`).join(",");
      const recs = await sfQuery(org,
        `SELECT DurableId, QualifiedApiName, IsCustomSetting FROM EntityDefinition ` +
        `WHERE DurableId IN (${idList})`);
      for (const r of recs) map[r.DurableId] = r;
    }
    if (Object.keys(map).length) {
      const mdt = empty(), cs = empty();
      for (const id of ids) {
        const r = map[id.slice(0, 15)];
        if (!r) { mdt.names.add(id); mdt.resolved = false; continue; }
        (r.IsCustomSetting ? cs : mdt).names.add(r.QualifiedApiName);
      }
      return { mdt, cs };
    }
  } catch (e) { /* fall through */ }
  // Fallback: resolve names without the split and keep them together
  const combined = await resolveNames(org, "CustomEntityDefinition", ids);
  return { mdt: combined, cs: empty() };
}

async function getEntityAccess(org, psId) {
  const recs = await sfQuery(org, `
    SELECT SetupEntityId, SetupEntityType
    FROM SetupEntityAccess WHERE ParentId = '${psId}'`);
  const byType = {};
  for (const r of recs) {
    (byType[r.SetupEntityType] ||= new Set()).add(r.SetupEntityId);
  }
  const out = {};
  for (const [type, ids] of Object.entries(byType)) {
    if (type === "CustomEntityDefinition") {
      const { mdt, cs } = await resolveCustomEntities(org, ids);
      out.CustomMetadataType = mdt;
      out.CustomSettingDefinition = cs;
    } else {
      out[type] = await resolveNames(org, type, ids);
    }
  }
  // Raw counts straight from the API — shown in the progress log so an
  // empty category is verifiable ("the org returned 0") at a glance.
  const counts = Object.entries(byType)
    .map(([t, s]) => `${t}:${s.size}`).sort().join(", ");
  return { access: out, summary: counts || "none" };
}

async function extract(org, permsetName, onProgress) {
  onProgress(`${org.label}: fetching permission set…`);
  const { id, perms, labels, dupeNote } =
    await getPermSetWithBooleans(org, permsetName);
  if (dupeNote) onProgress(`⚠ ${dupeNote}`);
  onProgress(`${org.label}: fetching object & field permissions…`);
  const [objectPerms, fieldPerms, tabSettings] = await Promise.all([
    getObjectPerms(org, id), getFieldPerms(org, id), getTabSettings(org, id),
  ]);
  onProgress(`${org.label}: fetching app/entity access grants…`);
  const ea = await getEntityAccess(org, id);
  onProgress(`${org.label}: grants found — ${ea.summary}`);
  return { perms, permLabels: labels, objectPerms, fieldPerms, tabSettings,
           entityAccess: ea.access, dupeNote };
}

// ---------------------------------------------------------------------------
// Comparison — matrix model: ONE row per item (object, field, entity…),
// with each org getting a group of permission columns side by side.
// Every row is kept; differing cells are flagged individually.
// ---------------------------------------------------------------------------

function matrixRows(a, b, subCols) {
  const rows = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const inA = k in a, inB = k in b;
    const sa = a[k] || {}, sb = b[k] || {};
    const diffCols = subCols.filter((c) => {
      const v1 = inA ? sa[c] : undefined;
      const v2 = inB ? sb[c] : undefined;
      return v1 !== v2;
    });
    rows.push({ key: k, sa, sb, inA, inB, diffCols, diff: diffCols.length > 0 });
  }
  return rows;
}

// Wrap flat {k: bool} maps and Sets into the nested shape matrixRows expects
function toNested(flat, col) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) out[k] = { [col]: v };
  return out;
}
function setToNested(set, col) {
  const out = {};
  for (const k of set) out[k] = { [col]: true };
  return out;
}

// Column order follows the classic profile matrix: R, C, E, D, VA, MA
const OBJECT_COLS = ["Read", "Create", "Edit", "Delete", "View All", "Modify All"];
const OBJECT_COLS_SHORT = ["R", "C", "E", "D", "VA", "MA"];

// The permission set page's standard sections, in Salesforce's order.
// Every one of these appears in the results whether or not any grants exist.
// A key can be an array when Salesforce uses multiple type names for one section.
const FIXED_ENTITY_SECTIONS = [
  ["TabSet", "Assigned Apps"],
  ["ConnectedApplication", "Assigned Connected Apps"],
  ["ApexClass", "Apex Class Access"],
  ["ApexPage", "Visualforce Page Access"],
  ["ExternalDataSource", "External Data Source Access"],
  ["FlowDefinition", "Flow Access"],
  ["NamedCredential", "Named Credential Access"],
  [["ExternalCredentialPrincipal", "ExternalCredentialParameter"],
    "External Credential Principal Access"],
  ["DataCategoryGroup", "Data Category Visibility"],
  ["ServicePresenceStatus", "Service Presence Statuses Access"],
  ["CustomPermission", "Custom Permissions"],
  ["CustomMetadataType", "Custom Metadata Types"],
  ["CustomSettingDefinition", "Custom Setting Definitions"],
  ["OrgWideEmailAddress", "Organization-Wide Email Address Access"],
  ["StandardInvocableActionType", "Standard Invocable Action Type Access"],
  ["EmailRoutingAddress", "Email-to-Case Routing Address Access"],
  ["ServiceProvider", "Service Providers"],
];

function entityFor(d, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const merged = { names: new Set(), nameToId: {}, resolved: true };
  for (const k of list) {
    const e = d.entityAccess[k];
    if (!e) continue;
    for (const n of e.names) merged.names.add(n);
    Object.assign(merged.nameToId, e.nameToId || {});
    if (!e.resolved) merged.resolved = false;
  }
  return merged;
}

function buildSections(d1, d2) {
  const sections = [];

  // Entity-access sections, in Salesforce's standard order, always present
  const consumed = new Set();
  for (const [keys, title] of FIXED_ENTITY_SECTIONS) {
    for (const k of Array.isArray(keys) ? keys : [keys]) consumed.add(k);
    const e1 = entityFor(d1, keys), e2 = entityFor(d2, keys);
    const sec = {
      title,
      keyHeader: "Name",
      subCols: ["Access"],
      rows: matrixRows(setToNested(e1.names, "Access"),
                       setToNested(e2.names, "Access"), ["Access"]),
      note: (!e1.resolved || !e2.resolved)
        ? "Some entries could not be resolved to names and show as raw IDs. Unresolved IDs can't be matched by name across orgs, so they may appear as one-sided rows — verify those manually. (IDs match between sandboxes copied from the same production.)"
        : null,
    };
    // Assigned Apps: show each org's app ID next to the name
    if (title === "Assigned Apps") {
      sec.sideIds = { a: e1.nameToId || {}, b: e2.nameToId || {} };
    }
    sections.push(sec);
  }

  // Any grant types Salesforce adds that we don't know yet — never drop data
  const allTypes = new Set([
    ...Object.keys(d1.entityAccess), ...Object.keys(d2.entityAccess)]);
  for (const type of [...allTypes].sort()) {
    if (consumed.has(type)) continue;
    const e1 = d1.entityAccess[type] || { names: new Set(), resolved: true };
    const e2 = d2.entityAccess[type] || { names: new Set(), resolved: true };
    sections.push({
      title: TYPE_LABELS[type] || `${type} Access`,
      keyHeader: "Name",
      subCols: ["Access"],
      rows: matrixRows(setToNested(e1.names, "Access"),
                       setToNested(e2.names, "Access"), ["Access"]),
      note: (!e1.resolved || !e2.resolved)
        ? "Names could not be resolved for this type, so raw IDs are compared. IDs match between sandboxes copied from the same production but differ between unrelated orgs — verify manually."
        : null,
    });
  }

  const sysLabels = { ...(d2.permLabels || {}), ...(d1.permLabels || {}) };
  const allPermRows = matrixRows(toNested(d1.perms, "Granted"),
                                 toNested(d2.perms, "Granted"), ["Granted"]);
  const byLabel = (a, b) =>
    (sysLabels[a.key] || a.key).localeCompare(sysLabels[b.key] || b.key);
  const isApp = (r) =>
    (typeof APP_PERMISSION_NAMES !== "undefined" && APP_PERMISSION_NAMES.has(r.key)) ||
    (typeof APP_PERMISSION_LABELS_NORM !== "undefined" &&
      APP_PERMISSION_LABELS_NORM.has(normalizePermLabel(sysLabels[r.key] || r.key)));
  const appRows = allPermRows.filter(isApp).sort(byLabel);
  const sysRows = allPermRows.filter((r) => !isApp(r)).sort(byLabel);
  sections.push({
    title: "App Permissions",
    keyHeader: "Permission",
    subCols: ["Granted"],
    rows: appRows,
    keyLabels: sysLabels,
  });
  sections.push({
    title: "System Permissions",
    keyHeader: "Permission",
    subCols: ["Granted"],
    rows: sysRows,
    keyLabels: sysLabels,
  });
  sections.push({
    title: "Object Settings — Object Permissions",
    keyHeader: "Object",
    subCols: OBJECT_COLS,
    shortCols: OBJECT_COLS_SHORT,
    rows: matrixRows(d1.objectPerms, d2.objectPerms, OBJECT_COLS),
  });
  const flsRows = matrixRows(d1.fieldPerms, d2.fieldPerms, ["Read", "Edit"]);
  for (const r of flsRows) r.group = r.key.split(".")[0];
  sections.push({
    title: "Object Settings — Field-Level Security",
    keyHeader: "Field Name",
    subCols: ["Read", "Edit"],
    rows: flsRows,
    objectFilter: true,
    objCrud: { a: d1.objectPerms, b: d2.objectPerms },
  });
  sections.push({
    title: "Object Settings — Tab Visibility",
    keyHeader: "Tab",
    subCols: ["Visibility"],
    rows: matrixRows(d1.tabSettings, d2.tabSettings, ["Visibility"]),
  });

  for (const s of sections) s.diffCount = s.rows.filter((r) => r.diff).length;
  return sections;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Compact matrix marks (like the ✓/blank cells in a profile spreadsheet)
function mark(v) {
  if (v === true) return '<span class="mk yes">✓</span>';
  if (v === false) return '<span class="mk no">✗</span>';
  if (v === undefined || v === null) return '<span class="mk none">–</span>';
  return esc(v); // string values like tab Visibility
}

// Per-section object selection for the FLS object filter
const objectSelections = {};

// Object CRUD block shown above the field table when an object is selected —
// matches the sketch: Read/Create/Edit/Delete/View All/Modify All rows,
// one column pair per org.
function crudBlockHtml(obj, objCrud, orgNames) {
  const a = objCrud.a[obj], b = objCrud.b[obj];
  const rows = OBJECT_COLS.map((c) => {
    const v1 = a ? a[c] : undefined;
    const v2 = b ? b[c] : undefined;
    const cls = v1 !== v2 ? "markcell cell-diff" : "markcell";
    return `<tr><th class="lbl">${esc(c)}</th><td class="${cls}">${mark(v1)}</td>` +
      `<th class="lbl gstart">${esc(c)}</th><td class="${cls}">${mark(v2)}</td></tr>`;
  }).join("");
  return `<div class="crud-wrap"><div class="crud-caption">Object permissions — ${esc(obj)}</div>
    <table class="matrix crud-block">
    <tr><th class="grp g1" colspan="2">${esc(orgNames[0])}</th>
        <th class="grp g2 gstart" colspan="2">${esc(orgNames[1])}</th></tr>
    ${rows}</table></div>`;
}

// Matrix table where EACH org group carries its own name column + value
// columns, exactly like the sketch (Field Name | Read | Edit ‖ Field Name | Read | Edit)
function matrixTableHtml(sec, rows, orgNames, keyDisplay) {
  const cols = sec.shortCols || sec.subCols;
  const span = sec.subCols.length + 1; // +1 for the name column in each group
  const h1 = `<tr><th class="grp g1" colspan="${span}">${esc(orgNames[0])}</th>` +
             `<th class="grp g2 gstart" colspan="${span}">${esc(orgNames[1])}</th></tr>`;
  const h2 = "<tr>" + [0, 1].map((side) =>
    `<th${side ? ' class="gstart"' : ""}>${esc(sec.keyHeader)}</th>` +
    cols.map((c, i) =>
      `<th class="sub" title="${esc(sec.subCols[i])}">${esc(c)}</th>`).join("")
  ).join("") + "</tr>";

  const body = rows.map((r) => {
    const sideHtml = (sideIdx, present, data, gstart) => {
      let disp = keyDisplay(r.key);
      if (sec.sideIds && present) {
        const id = (sideIdx === 0 ? sec.sideIds.a : sec.sideIds.b)[r.key];
        if (id && id !== disp) disp = `${id} (${disp})`;
      }
      let tds = `<td${gstart ? ' class="gstart"' : ""} title="${esc(r.key)}">${
        present ? esc(disp) : '<span class="mk none">—</span>'}</td>`;
      tds += sec.subCols.map((c) => {
        const v = present ? data[c] : undefined;
        const cls = ["markcell"];
        if (r.diffCols.includes(c)) cls.push("cell-diff");
        return `<td class="${cls.join(" ")}">${mark(v)}</td>`;
      }).join("");
      return tds;
    };
    return `<tr>${sideHtml(0, r.inA, r.sa, false)}${sideHtml(1, r.inB, r.sb, true)}</tr>`;
  }).join("");

  return `<table class="matrix">${h1}${h2}${body}</table>`;
}

function sectionHtml(sec, showAll, idx, orgNames, exportMode) {
  let rows = showAll ? sec.rows : sec.rows.filter((r) => r.diff);
  const n = sec.diffCount;
  const badge = sec.rows.length === 0
    ? '<span class="badge same">no grants</span>'
    : n
      ? `<span class="badge diff">${n} of ${sec.rows.length} differ</span>`
      : `<span class="badge same">identical · ${sec.rows.length} item${sec.rows.length === 1 ? "" : "s"}</span>`;

  if (sec.rows.length === 0) {
    return wrapSection(sec, idx, badge,
      `<div class="placeholder">Neither org grants any ${esc(sec.title.toLowerCase())
        .replace(" access", "")} in this permission set.</div>`, 0, false);
  }

  let pre = "";
  let keyDisplay = (k) => k;
  if (sec.keyLabels) keyDisplay = (k) => sec.keyLabels[k] || k;

  // Field-Level Security: user picks an object; we show that object's CRUD
  // block on top, then its fields underneath (per the sketch).
  if (sec.objectFilter && !exportMode) {
    const byObj = {};
    for (const r of sec.rows) {
      (byObj[r.group] ||= { total: 0, diff: 0 });
      byObj[r.group].total++;
      if (r.diff) byObj[r.group].diff++;
    }
    const sel = objectSelections[idx] || "";
    const opts = Object.keys(byObj).sort().map((o) =>
      `<option value="${esc(o)}" ${sel === o ? "selected" : ""}>${esc(o)} — ${
        byObj[o].total} field${byObj[o].total === 1 ? "" : "s"}${
        byObj[o].diff ? `, ${byObj[o].diff} differ` : ""}</option>`).join("");
    pre = `<div class="obj-filter-bar">
      <label>Object:</label>
      <select class="obj-filter" data-sec="${idx}">
        <option value="">— choose an object —</option>
        <option value="__diffs__" ${sel === "__diffs__" ? "selected" : ""}>★ All fields with differences (${sec.diffCount})</option>
        ${opts}
      </select></div>`;
    if (sel === "") {
      return wrapSection(sec, idx, badge, pre +
        `<div class="placeholder">Choose an object above to see its permissions and fields side by side (${
          Object.keys(byObj).length} objects, ${sec.rows.length} fields total).</div>`,
        n, true);
    }
    if (sel === "__diffs__") {
      rows = sec.rows.filter((r) => r.diff);
    } else {
      rows = (showAll ? sec.rows : sec.rows.filter((r) => r.diff))
        .filter((r) => r.group === sel);
      // In show-differences mode a chosen object may have no differing
      // fields; fall back to showing all its fields so the view isn't empty.
      if (!rows.length) rows = sec.rows.filter((r) => r.group === sel);
      keyDisplay = (k) => k.slice(sel.length + 1);
      pre += crudBlockHtml(sel, sec.objCrud, orgNames);
    }
  }

  const table = rows.length
    ? matrixTableHtml(sec, rows, orgNames, keyDisplay)
    : `<div class="placeholder">Nothing to show here${showAll ? "" : " — no differences"}.</div>`;
  return wrapSection(sec, idx, badge, pre + table, n,
    sec.objectFilter && objectSelections[idx]);
}

function wrapSection(sec, idx, badge, body, diffCount, forceOpen) {
  const note = sec.note ? `<div class="note">⚠ ${esc(sec.note)}</div>` : "";
  return `<details class="category" id="sec-${idx}" ${diffCount || forceOpen ? "open" : ""}>` +
    `<summary><span class="title">${esc(sec.title)}</span> ${badge}</summary>${body}${note}</details>`;
}

// Short org name for table columns: "Acme Corp (Sandbox)" from the full label.
// If both orgs share a name (two sandboxes of the same production), fall back
// to the full labels including the host so the columns stay distinguishable.
function shortOrgName(label) {
  return label.split(" — ")[0];
}
function orgColumnNames(label1, label2) {
  const s1 = shortOrgName(label1), s2 = shortOrgName(label2);
  if (s1 !== s2) return [s1, s2];
  // Same display name: append the distinguishing host part
  const host = (l) => (l.split(" — ")[1] || "").replace(".my.salesforce.com", "")
    .replace(".sandbox", "").replace(".salesforce.com", "");
  return [`${s1} [${host(label1)}]`, `${s2} [${host(label2)}]`];
}

function render(sections, permset, org1, org2, showAll) {
  const total = sections.reduce((s, x) => s + x.diffCount, 0);
  const diffCats = sections.filter((s) => s.diffCount).length;
  const orgNames = orgColumnNames(org1, org2);

  const summary = `
    <div class="card summary">
      <div class="big ${total ? "diff" : "same"}">${total}</div>
      <div class="meaning">
        difference${total === 1 ? "" : "s"} in "${esc(permset)}"
        <small>${total
          ? `across ${diffCats} of ${sections.length} categories`
          : "the permission set is identical in both orgs 🎉"}</small>
      </div>
      <div class="org-chips">
        <span class="org-chip o1">${esc(orgNames[0])}</span> vs
        <span class="org-chip o2">${esc(orgNames[1])}</span>
      </div>
      <div class="legend" style="flex-basis:100%">
        <span><span class="mk yes">✓</span> granted</span>
        <span><span class="mk no">✗</span> not granted</span>
        <span><span class="mk none">–</span> not in this org</span>
        <span class="hl-sample">shaded cell = differs</span>
        <span>Object columns: R Read · C Create · E Edit · D Delete · VA View All · MA Modify All</span>
      </div>
    </div>`;

  const overview = `
    <div class="overview">` +
    sections.map((s, i) => `
      <a class="ov-card" href="#sec-${i}">
        <div class="ov-title">${esc(s.title)}</div>
        ${s.rows.length === 0
          ? `<span class="ov-count">no grants</span>`
          : s.diffCount
            ? `<span class="ov-diff">▲ ${s.diffCount} difference${s.diffCount === 1 ? "" : "s"}</span><span class="ov-count"> · ${s.rows.length} item${s.rows.length === 1 ? "" : "s"}</span>`
            : `<span class="ov-same">✓ identical</span><span class="ov-count"> · ${s.rows.length} item${s.rows.length === 1 ? "" : "s"}</span>`}
      </a>`).join("") +
    `</div>`;

  const toolbar = `
    <div class="toolbar">
      <input type="text" id="filter" placeholder="Search within results, e.g. Opportunity, ModifyAllData…">
      <span class="muted" id="filter-count"></span>
    </div>`;

  document.getElementById("results").innerHTML =
    summary + overview + toolbar +
    sections.map((s, i) => sectionHtml(s, showAll, i, orgNames, false)).join("");
  bindFilter();
  bindObjectFilters();
}

function bindObjectFilters() {
  document.querySelectorAll(".obj-filter").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      objectSelections[e.target.dataset.sec] = e.target.value;
      rerender();
      const el = document.getElementById("sec-" + e.target.dataset.sec);
      if (el) el.scrollIntoView();
    });
  });
}

// Live search across all result tables
function bindFilter() {
  const input = document.getElementById("filter");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    let matches = 0;
    document.querySelectorAll("details.category").forEach((cat) => {
      let catMatches = 0;
      cat.querySelectorAll("tr").forEach((tr) => {
        if (!tr.querySelector("td")) return; // header row
        const hit = !q || tr.textContent.toLowerCase().includes(q);
        tr.style.display = hit ? "" : "none";
        if (hit) catMatches++;
      });
      if (q) {
        cat.style.display = catMatches ? "" : "none";
        if (catMatches) cat.open = true;
      } else {
        cat.style.display = "";
      }
      matches += catMatches;
    });
    document.getElementById("filter-count").textContent =
      q ? `${matches} matching row${matches === 1 ? "" : "s"}` : "";
  });
}


function setStatus(msg, isError) {
  const el = document.getElementById("status");
  el.className = isError ? "error" : "";
  el.textContent = msg;
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

let lastSections = null;
let lastPermset = null;
let lastOrgLabels = ["", ""];

function showAllMode() {
  return document.getElementById("show-all").checked;
}

function rerender() {
  if (!lastSections) return;
  render(lastSections, lastPermset, lastOrgLabels[0], lastOrgLabels[1], showAllMode());
}

document.getElementById("show-all").addEventListener("change", rerender);

document.getElementById("org1-select").addEventListener("change", onOrgSelectionChange);
document.getElementById("org2-select").addEventListener("change", onOrgSelectionChange);
document.getElementById("refresh").addEventListener("click", refreshOrgs);

document.getElementById("compare").addEventListener("click", async () => {
  const org1 = selectedOrg(1), org2 = selectedOrg(2);
  const permset = document.getElementById("permset").value.trim();
  const btn = document.getElementById("compare");

  if (!org1 || !org2) { setStatus("Choose both orgs first.", true); return; }
  if (org1.key === org2.key) {
    setStatus("Org 1 and Org 2 are the same org — pick two different ones.", true);
    return;
  }
  if (!permset) { setStatus("Pick a permission set.", true); return; }
  const opt = permsetOptions.find((p) => p.name === permset);
  if (opt && !opt.inOrg2) {
    setStatus(`"${permset}" doesn't exist in Org 2, so every grant would show ` +
      "as a difference. Deploy it first, or pick another set.", true);
    return;
  }

  btn.disabled = true;
  document.getElementById("results").innerHTML = "";
  const progress = [];
  const onProgress = (m) => { progress.push(m); setStatus(progress.join("\n")); };

  try {
    const [d1, d2] = await Promise.all([
      extract(org1, permset, onProgress),
      extract(org2, permset, onProgress),
    ]);
    onProgress("Comparing…");
    lastSections = buildSections(d1, d2);
    lastPermset = permset;
    lastOrgLabels = [
      detectedOrgs[document.getElementById("org1-select").value].label,
      detectedOrgs[document.getElementById("org2-select").value].label,
    ];
    rerender();
    // Keep the fetch log visible — it shows exactly what each org returned
    setStatus(progress.join("\n"));
    document.getElementById("export").disabled = false;
  } catch (e) {
    setStatus("Error: " + e.message +
      "\nYour session may have expired — log into the org again in another " +
      "tab, click Refresh orgs, and retry.", true);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("export").addEventListener("click", () => {
  if (!lastSections) return;
  const showAll = showAllMode();
  const orgNames = orgColumnNames(lastOrgLabels[0], lastOrgLabels[1]);
  const style = document.querySelector("style").innerHTML;
  const total = lastSections.reduce((s, x) => s + x.diffCount, 0);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<title>PermSet Diff: ${esc(lastPermset)}</title><style>${style}</style></head>` +
    `<body><header><h1>Permission Set Comparison — ${esc(lastPermset)}</h1>` +
    `<p>${esc(orgNames[0])} vs ${esc(orgNames[1])} · ${total} differences` +
    `${showAll ? " · full listing" : ""} · ${new Date().toLocaleString()}</p></header>` +
    `<main>${lastSections.map((s, i) => sectionHtml(s, showAll, i, orgNames, true)).join("")}</main></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `permset-diff-${lastPermset}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Detect orgs on load
refreshOrgs();
