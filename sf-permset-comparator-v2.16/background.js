// Clicking the toolbar icon opens the comparator in a full tab
// (a popup is too cramped for side-by-side diff tables).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("comparator.html") });
});
