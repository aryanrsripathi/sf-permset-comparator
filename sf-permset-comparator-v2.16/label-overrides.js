// Label corrections for System Permissions.
//
// The extension displays Salesforce's own field labels (from the
// PermissionSet describe call), which match the Setup UI for nearly all
// permissions. A few legacy fields carry labels that deviate from the
// Setup page. Add corrections here as you find them:
//
//   key   = API name shown in the row's hover tooltip (without the
//           "Permissions" prefix), e.g. "EditPublicFilters"
//   value = the exact label the Salesforce Setup page shows
//
// Entries here always win over the describe label.
const LABEL_OVERRIDES = {
  // Example (only add if your org's describe label actually deviates):
  // EditPublicFilters: "Manage Public List Views",
};
