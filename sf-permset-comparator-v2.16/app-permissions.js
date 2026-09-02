// App Permissions vs System Permissions grouping.
//
// Salesforce shows these as two separate pages, but the API stores them all
// as identical Permissions* fields with no page indicator. This file decides
// which permissions appear under "App Permissions"; everything else lands
// under "System Permissions".
//
// Two ways to match — either one puts a permission in App Permissions:
//   APP_PERMISSION_LABELS — the display label, exactly as the Setup page
//     shows it (easiest: copy the label from the extension row)
//   APP_PERMISSION_NAMES  — the API name from the row's hover tooltip
//     (without the "Permissions" prefix)
//
// Matching is case-insensitive and tolerant of dash/space variations.
// Entries that don't exist in your org are ignored, so extras are harmless.

const APP_PERMISSION_LABELS = new Set([
  // ── Call Center ──────────────────────────────────────────────
  "Access Conversation Entries",
  "Access Virtual Desktop Infrastructure for Voice Calls through Citrix",
  "Agentforce Service Agent User",
  "Agent Initiated Outbound Messaging",
  "Bypass Email Approval",
  "Configure Messaging",
  "Control Call Recording",
  "Edit Case Comments",
  "End Messaging Session",
  "Enhanced Chat Rep",
  "Import Solutions",
  "Initiate Messaging Sessions",
  "Manage Agentforce Service Agents",
  "Manage Business Hours Holidays",
  "Manage Call Centers",
  "Manage Cases",
  "Manage Categories",
  "Manage Customer Users",
  "Manage Entitlements",
  "Manage Macros Users Can't Undo",
  "Manage Numbers",
  "Manage Published Solutions",
  "Manage Queue Memberships",
  "Manage Voicemail greetings",
  "Message Customers with Bring Your Own Channel",
  "Message on Mobile",
  "Messaging Agent",
  "Remote Media for Virtual Desktop",
  "Run Macros on Multiple Records",
  "Salesforce Voice Contact Center Admin (Partner Telephony)",
  "Salesforce Voice Contact Center Rep",
  "Salesforce Voice Contact Center Rep (Partner Telephony)",
  "Salesforce Voice Contact Center Supervisor",
  "Salesforce Voice Delegated Contact Center Admin",
  "Send Initial SMS Message to Individual",
  "Send One-to-Many Messages",
  "Slack Service User",
  "Transfer Cases",
  "Use Service Assistive Actions",
  "Use Voicemail Drops",
  // ── Content ──────────────────────────────────────────────────
  "Delete Salesforce Files",
  "Download Malicious Files",
  "Manage Content Permissions",
  "Manage Content Properties",
  "Manage Malicious Files",
  "Manage record types and layouts for Files",
  "Manage Salesforce CRM Content",
  "Query All Files",
  "Query Non Vetoed Files",
  "View Content in Portals",
  // ── Content Taxonomy ─────────────────────────────────────────
  "Manage Content Taxonomy",
  "View Content Taxonomy",
  // ── Flow and Flow Orchestration ──────────────────────────────
  "Access Orchestration Objects",
  "Enable System Mode Flow Activation",
  "Manage Flow",
  "Manage Orchestration Runs",
  "Manage Orchestration Runs and Work Items",
  "Reassign Orchestration Work Items",
  "Run Flows",
  "View Flow Usage and Flow Event Data",
  "View Orchestrations in Automation App",
  // ── Knowledge Management ─────────────────────────────────────
  "Allow View Knowledge",
  "Archive Articles",
  "Article Translation - Edit",
  "Article Translation - Publish",
  "Article Translation - Submit for Translation",
  "Knowledge One",
  "Manage Articles",
  "Manage Knowledge Article Import/Export",
  "Manage Salesforce Knowledge",
  "Publish Articles",
  "Share internal Knowledge articles externally",
  "View Archived Articles",
  "View Draft Articles",
  // ── Partner Relationship Management ──────────────────────────
  "IP Restrict Requests",
  "Manage External Users",
  "Manage External Users (Limited)",
  "Set Up Partner Connect for a Partner Org",
  // ── Sales ────────────────────────────────────────────────────
  "Access Contact Intelligence View in Partner Sites",
  "Access Lead Intelligence View in Partner Sites",
  "Access to view Data Assessment",
  "Activate Contracts",
  "Activate Orders",
  "Allows the Cloud Integration User to perform SalesforceIQ internal operations",
  "Campaign Influence",
  "Convert Leads",
  "Delete Activated Contracts",
  "Edit Activated Orders",
  "Edit Opportunity Product Sales Price",
  "Import Leads",
  "Import Personal Contacts",
  "Inbox Scheduling Proxy User",
  "Manage Leads",
  "Publish Einstein Lead Scoring results",
  "Sales Console",
  "Send Stay-in-Touch Requests",
  "Slack Sales User",
  "Transfer Leads",
  "Use Conversation Insights for Sales",
  "Use Einstein Activity Capture",
  "Use Einstein Activity Capture Standard",
  "Use Einstein Automated Contacts",
  "Use Einstein Forecasting",
  "Use Einstein Lead Scoring",
  "Use Einstein Opportunity Scoring",
  "Use Inbox",
  "Use Salesforce Meetings",
  "Use Team Reassignment Wizards",
  "Use Video Conferencing with Google Meet",
  "Use Video Conferencing with Teams",
  "Use Video Conferencing with Zoom",
  "View All Activities",
  "View All Voice And Video Calls",
  "View and Edit Converted Leads",
  "View Opportunity Scoring Model Factors",
]);

// Secondary mechanism: match by API name (hover tooltip, without the
// "Permissions" prefix). Useful when a label differs between orgs.
const APP_PERMISSION_NAMES = new Set([
  "ConvertLeads",
  "ImportLeads",
  "TransferAnyLead",
  "ImportPersonal",
  "EditOppLineItemUnitPrice",
  "UseTeamReassignWizards",
  "ActivateContract",
  "ActivateOrder",
  "EditActivatedOrders",
  "DeleteActivatedContract",
  "ManageCallCenters",
  "TransferAnyCase",
  "ManageSolutions",
  "ManageCategories",
  "ManageEntitlements",
  "ManageBusinessHourHolidays",
  "ManageKnowledge",
  "ManageKnowledgeImportExport",
  "ManageContent",
  "ManageContentPermissions",
  "ManageContentProperties",
  "ManageContentTypes",
]);

// Normalized label lookup (case-insensitive, dash/space tolerant)
function normalizePermLabel(s) {
  return String(s).toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")   // en/em dashes -> hyphen
    .replace(/\s+/g, " ")
    .trim();
}
const APP_PERMISSION_LABELS_NORM = new Set(
  [...APP_PERMISSION_LABELS].map(normalizePermLabel));
